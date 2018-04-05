'use strict';
const fs = require('fs');
const path = require('path');
const async = require('async');
const Config = require('../config/Config');
const Enumerator = require('../class/Enumerator');
const ExamController = require('../controller/Exam.ctrl');
const AggregationBO = require('../lib/omr-base/business/Aggregation.bo');

class Generator {
    static Run(callback) {
        logger.debug("Generator Started", new Date());
        Generator.Callback = callback;
        if (Config.DeveloperDebug.CLEAR_DATA) Generator.Clear(Generator.Generate);
        else Generator.Generate();
    }

    static RemoveFiles(dirPath, _callback) {
        logger.debug("Unlink files in", dirPath);
        var filesRef, queue;
        filesRef = fs.readdirSync(dirPath);
        queue = [];
        if (filesRef.length) {
            filesRef.forEach(function (fRef) {
                queue.push(function (_c) {
                    fs.unlink(path.normalize(dirPath + '/' + fRef), function (err) {
                        if (err) {
                            logger.debug("Unlink file Error", err);
                            _c(err);
                        }
                        else _c();
                    })
                })
            });

            async.parallel(queue, _callback);
        } else _callback();
    }

    static Clear(next) {
        logger.debug("Erasing data");
        var dScanned, dOriginal, dEqualized, dResult, dError, aggregation, exam, queue;
        dScanned = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.SCANNED);
        dOriginal = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.ORIGINAL);
        dEqualized = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.EQUALIZED);
        dResult = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.RESULT);
        dError = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.ERROR);

        if (!fs.existsSync(dScanned)) {
            logger.debug(dScanned, 'folder MUST EXISTS');
            process.exit(1);
        }

        queue = [];
        queue.push(function (_c) {
            if (fs.existsSync(dOriginal)) Generator.RemoveFiles(dOriginal, _c);
            else _c();
        });     //Remove Original Files
        queue.push(function (_c) {
            if (fs.existsSync(dEqualized)) Generator.RemoveFiles(dEqualized, _c);
            else _c();
        });     //Remove Equalized Files
        queue.push(function (_c) {
            if (fs.existsSync(dResult)) Generator.RemoveFiles(dResult, _c);
            else _c();
        });     //Remove Result Files
        queue.push(function (_c) {
            if (fs.existsSync(dError)) Generator.RemoveFiles(dError, _c);
            else _c();
        });     //Remove Error Files
        queue.push(function (_c) {
            exam = new ExamController();
            exam.RemoveAll(
                function (err) {
                    if (err) {
                        logger.debug('Database Error', err);
                        _c(err);
                    }
                    else _c();
                },
                true
            );
        });     //Remove Exams from DB
        queue.push(function (_c) {
            aggregation = new AggregationBO();
            aggregation.UpdateByQuery(
                null,
                {
                    $set: {
                        processStatus: Enumerator.ProcessStatus.RAW
                    }
                },
                {
                    multi: true
                },
                function (err) {
                    if (err) {
                        logger.debug('Database Error', err);
                        _c(err);
                    }
                    else _c();
                }
            );
        });     //Reset Aggregation Process Status in DB

        async.series(queue, function (err) {
            if (err) {
                logger.debug('Clear process terminated with errors', err);
                process.exit(1);
            }
            else next();
        })
    }

    static Generate() {
        logger.debug('Start Exam Generator');
        let dScanned, dOriginal, refFileList, fileList, aggregation, exam, agQueue, aggregationBO;

        dScanned = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.SCANNED);
        dOriginal = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.ORIGINAL);
        refFileList = fs.readdirSync(dScanned);
        aggregationBO = new AggregationBO();

        if (refFileList.length) {
            aggregationBO.GetByQuery(
                null,
                null,
                null,
                null,
                function (err, agList) {
                    if (err) {
                        logger.debug('Database Error', err);
                        process.exit(1);
                    }
                    //TODO: Error Handler
                    else if (agList.length == 0) {
                        logger.debug('No Aggregations in Database');
                        process.exit(1);
                    }
                    else {

                        fileList = [];
                        refFileList.forEach(function (file) {
                            let extName, filePath;
                            filePath = path.normalize(dScanned + '/' + file);
                            extName = path.extname(filePath).replace('.', '');

                            if (Enumerator.FileExtensions._regex.test(extName)) {
                                fileList.push(function (_c) {
                                    fs.readFile(filePath, function (err, content) {
                                        if (err) {
                                            logger.debug('Read file error', err);
                                            _c(err);
                                        }
                                        else _c(null, {content: content, extension: extName});
                                    })
                                });
                            }
                        });

                        if (!fileList.length) {
                            logger.debug('No valid file found');
                            process.exit(1);
                        }
                        else {
                            async.series(fileList, function (err, result) {
                                if (err) {
                                    logger.debug('Read Files process terminated with errors', err);
                                    process.exit(1);
                                }

                                else if (!result || !result.length) {
                                    logger.debug('No valid file found');
                                    process.exit(1);
                                }
                                else {
                                    fileList = result;

                                    agQueue = [];
                                    exam = new ExamController();
                                    agList.forEach(function (ag, i) {
                                        agQueue.push(function (_c) {
                                            let exQueue, total = 0;
                                            exQueue = [];

                                            fileList.forEach(function (_file, j) {
                                                exQueue.push(function (_eC) {
                                                    exam.Create(
                                                        {
                                                            _aggregation: ag._id,
                                                            processStatus: Enumerator.ProcessStatus.RAW,
                                                            fileExtension: _file.extension,
                                                            externalId: `${j}-${i}`
                                                        },
                                                        function (err, examDoc) {
                                                            let fPath;
                                                            if (err) {
                                                                logger.debug('Database Error', err);
                                                                _eC(err);
                                                            }
                                                            else {
                                                                fPath = path.normalize(dOriginal + '/' + examDoc._id + '.' + _file.extension);
                                                                fs.writeFile(fPath, _file.content, function (err) {
                                                                    if (err) {
                                                                        logger.debug('Write File Error', err);
                                                                        _eC(err);
                                                                    }
                                                                    else {
                                                                        total += 1;
                                                                        _eC();
                                                                    }
                                                                })
                                                            }
                                                        }
                                                    );
                                                });
                                            });

                                            async.series(exQueue, function (err, result) {
                                                if (err) {
                                                    logger.debug('Exam Generation process terminated with errors', err);
                                                    _c(err);
                                                }
                                                else {
                                                    aggregationBO.UpdateByQuery(
                                                        {_id: ag._id},
                                                        { $set: {
                                                            processStatus: Enumerator.ProcessStatus.RAW,
                                                            'exam.total': total,
                                                            'exam.success': 0,
                                                            'exam.warning': 0,
                                                            'exam.error': 0
                                                        } },
                                                        null,
                                                        (err) => {
                                                            if (err) logger.debug(err);
                                                            _c(null, result);
                                                        }
                                                    );
                                                }
                                            })
                                        });
                                    });

                                    async.series(agQueue, function (err, result) {
                                        if (err) {
                                            logger.debug('Exam Generation process terminated with errors', err);
                                            process.exit(1);
                                        }
                                        else Generator.Callback();
                                    })
                                }
                            });
                        }
                    }
                }
            );
        } else {
            logger.debug(dScanned, 'MUST HAVE files');
            process.exit(1);
        }
    };
}

module.exports = Generator;