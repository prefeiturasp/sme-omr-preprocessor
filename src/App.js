'use strict';
const fs = require('fs');
const path = require('path');
const async = require('async');
const Config = require('./config/Config');
Config.init();
const Enumerator = require('./class/Enumerator');
const Aggregation = require('./controller/Aggregation.ctrl');
const Exam = require('./controller/Exam.ctrl');
const mongo = require('./lib/omr-base/class/Database')(Config.MongoDB);
let Connector;

require('./lib/omr-base/class/Log')({
    db: mongo.db,
    connectionString: Config.MongoDB,
    label: Enumerator.LogType.PREPROCESSOR,
    level: Config.KeepLogLevel
});

Connector = require('./lib/omr-base/connector/ConnectorManager')(Config, Enumerator);

process.on('uncaughtException', (error) => {
    logger.error(error.message, {
        resource: {
            process: "UncaughtException"
        },
        detail: {
            description: error
        }
    }, () => {
        if (Aggregation.data && Aggregation.data.hasOwnProperty('processStatus')) {
            if (Aggregation.examCount > 0) Aggregation.data.processStatus = Enumerator.ProcessStatus.RAW;
            else Aggregation.data.processStatus = Enumerator.ProcessStatus.FINISHED;
            updateAggregation(false, 1);
        } else {
            process.exit(1);
        }
    });
});

process.on('unhandledRejection', (error, p) => {
    logger.error(error.message, {
        resource: {
            process: "UnhandledRejection"
        },
        detail: {
            description: error
        }
    }, () => {
        if (Aggregation.data && Aggregation.data.hasOwnProperty('processStatus')) {
            if (Aggregation.examCount > 0) Aggregation.data.processStatus = Enumerator.ProcessStatus.RAW;
            else Aggregation.data.processStatus = Enumerator.ProcessStatus.FINISHED;
            updateAggregation(false, 1);
        } else {
            process.exit(1);
        }
    });
});

process.on('SIGTERM', () => {
    logger.warn('SIGTERM', {
        resource: {
            process: "SIGTERM",
            params: []
        },
        detail: {
            description: 'Service terminated with SIGTERM signal'
        }
    }, () => {
        if (Aggregation.data && Aggregation.data.hasOwnProperty('processStatus')) {
            if (Aggregation.examCount > 0) Aggregation.data.processStatus = Enumerator.ProcessStatus.RAW;
            else Aggregation.data.processStatus = Enumerator.ProcessStatus.PENDING;
            updateAggregation(false, 0);
        } else {
            process.exit(0);
        }
    });
});

process.on('SIGINT', () => {
    logger.warn('SIGINT', {
        resource: {
            process: "SIGINT",
            params: []
        },
        detail: {
            description: 'Service terminated with SIGINT signal'
        }
    }, () => {
        if (Aggregation.data && Aggregation.data.hasOwnProperty('processStatus')) {
            if (Aggregation.examCount > 0) Aggregation.data.processStatus = Enumerator.ProcessStatus.RAW;
            else Aggregation.data.processStatus = Enumerator.ProcessStatus.PENDING;
            updateAggregation(false, 0);
        } else {
            process.exit(0);
        }
    });
});

/**
 * Run processor service
 */
function run() {
    logger.info('Started', {
        resource: {
            process: "PreProcessor.run",
        }
    });

    Aggregation.getNext((error, data) => {
        if (error) {
            logger.error(error.message, {
                resource: {
                    process: "AggregationController.GetNext"
                },
                detail: {
                    description: error
                }
            }, () => {
                process.exit(1);
            });
        } else if (!data) {
            logger.info('Finished', {
                resource: {
                    process: "PreProcessor.run",
                }
            }, () => {
                process.exit(0);
            });
        } else {
            Connector.GetExams(Aggregation.data._id, Aggregation.data.externalId, Aggregation.data.paginate)
                .then((total) => {
                    Aggregation.data.exam.total += total;
                    loadExamsFromDB();
                })
                .catch(() => {
                    loadExamsFromDB();
                });
        }
    })
}

/**
 * Load exam list from Database
 */
function loadExamsFromDB() {
    Aggregation.getExamList((error, examList) => {
        if (error) {
            logger.error(error.message, {
                resource: {
                    process: "AggregationController.getExamList"
                },
                detail: {
                    description: error
                }
            }, () => {
                process.exit(1);
            });
        } else if (!examList.length) {
            Aggregation.data.processStatus = Enumerator.ProcessStatus.FINISHED;
            updateAggregation(false);
        } else {
            Connector.SendAggregationLog({
                    aggregationExternalId: Aggregation.data.externalId,
                    aggregationId: Aggregation.data._id,
                    description: {message: 'Started'}
                },
                Enumerator.ProcessStatus.PRE_PROCESSING
            );

            Aggregation.data.processStatus = Enumerator.ProcessStatus.PRE_PROCESSING;
            updateAggregation(true);

            examProcessor(examList);
        }
    })
}

/**
 * Exam processor recursive
 * @param examList {Array} Exam document list
 */
function examProcessor(examList) {

    let currentExam = examList.pop();
    const exam = new Exam(Aggregation.data._template.ref, currentExam);
    const qrCode = Aggregation.data._template.ref.qrCode;

    Aggregation.examCount = examList.length;

    let templateRefExternalId;
    if (qrCode && Connector.hasOwnProperty('Manager') && !Config.DeveloperDebug) {
        templateRefExternalId = Aggregation.data._template.ref.externalId;
    }

    exam.startProcessing((err, res) => {
        processorCallback(err, res, examList);
    }, qrCode, templateRefExternalId);

}

/**
 * ExamProcessor callback
 * @param err {Error}
 * @param res {Object}
 * @param examList {Array}
 * @callback
 */
function processorCallback(err, res, examList) {
    setExamLog(err, res, res.Exam)
        .then((result) => {
            let queue = [];
            if (Array.isArray(result.error) && result.error.length) {
                Aggregation.data.exam.error += 1;
                Aggregation.incrementErrorCount();
                queue.push(Connector.SendExamLog(result.error));

            }else if (Array.isArray(result.absences) && result.absences.length){
                Aggregation.data.exam.absence += 1;
                Aggregation.incrementAbsenceCount();
                queue.push(Connector.SendExamLog(result.absences));
            }

            Promise.all(queue)
                .then(() => {
                    if (examList.length) examProcessor(examList);
                    else finishProcessing();
                })
                .catch(() => {
                    if (examList.length) examProcessor(examList);
                    else finishProcessing();
                });
        });
}

/**
 * Finish aggregation process
 */
function finishProcessing() {
    if (Aggregation.errorCount === Aggregation.totalExams) {
        Aggregation.data.processStatus = Enumerator.ProcessStatus.FINISHED;
        Connector.SendAggregationLog({
            aggregationExternalId: Aggregation.data.externalId,
            aggregationId: Aggregation.data._id,
            description: {message: 'Process finished'}
        }, Aggregation.data.processStatus)
            .then(() => {
                updateAggregation(false, 0);
            });
    } else if(Aggregation.absenceCount === Aggregation.totalExams){
        Aggregation.data.processStatus = Enumerator.ProcessStatus.FINISHED;
        updateAggregation(false, 0);
    } else {
        Aggregation.data.processStatus = Enumerator.ProcessStatus.PENDING;
        updateAggregation(false, 0);
    }
}

/**
 * Set exam log
 * @param error {Error} Exam error
 * @param result {Object} Exam result
 * @param exam {Object} Exam model reference
 * @return {Promise}
 */
function setExamLog(error, result, exam) {
    let ret = {};
    let queue = [];

    exam = result.Exam || exam;
    if (error) {
        ret.error = [];
        ret.error.push(
            {
                level: Enumerator.LogLevel.ERROR,
                examId: exam._id.toString(),
                examOwner: exam.owner,
                externalId: exam.externalId,
                processStatus: exam.processStatus,
                description: error.message,
                aggregationId: Aggregation.data._id,
                aggregationExternalId: Aggregation.data.externalId
            }
        );

        queue.push(
            new Promise((resolve) => {
                logger.error(error.message, {
                    resource: {
                        process: Aggregation.data._template.ref.qrCode ?
                            'ExamController.startProcessingQrCode' : 'ExamController.startProcessing',
                        params: [exam._id]
                    },
                    detail: {
                        description: error,
                        image: exam._id.toString(),
                        user: exam.owner
                    }
                }, () => {
                    resolve();
                });
            })
        );
    } else if (result.hasOwnProperty('ErrorList') && Array.isArray(result.ErrorList) && result.ErrorList.length > 0) {
        ret.error = [];
        result.ErrorList.forEach((error) => {
            ret.error.push(
                {
                    level: Enumerator.LogLevel.ERROR,
                    examId: exam._id.toString(),
                    examOwner: exam.owner,
                    externalId: exam.externalId,
                    processStatus: exam.processStatus,
                    description: error.hasOwnProperty('Description') && error.Description instanceof Error ?
                        error.Description.message : error.message,
                    aggregationId: Aggregation.data._id,
                    aggregationExternalId: Aggregation.data.externalId
                }
            );

            queue.push(
                new Promise((resolve) => {
                    logger.error(error.hasOwnProperty('Description') && error.Description instanceof Error ?
                        error.Description.message : error.message, {
                        resource: {
                            process: error.Process || Aggregation.data._template.ref.qrCode ?
                                'ExamController.startProcessingQrCode' : 'ExamController.startProcessing',
                            params: [exam._id]
                        },
                        detail: {
                            description: error.Description || error,
                            image: exam._id.toString()
                        }
                    }, () => {
                        resolve();
                    });
                })
            );
        });
    } else if (exam.absence) {

        ret.absences = [];
        ret.absences.push(
            {
                externalId: exam.externalId,
                processStatus: exam.processStatus,
                examOwner: exam.owner,
                _templateExternalId: Aggregation.data._template.externalId
            }
        );

        queue.push(
            new Promise((resolve) => {
                resolve();
            })
        );
    }

    return new Promise((resolve) => {
        Promise.all(queue)
            .then(() => {
                resolve(ret);
            })
            .catch(() => {
                resolve(ret);
            })
    });
}

/**
 *
 * @param keepRunning {Boolean=}
 * @param exitCode {Number=}
 */
function updateAggregation(keepRunning, exitCode) {
    exitCode = exitCode || 0;

    if (!keepRunning) {
        logger.info('Finished', {
            resource: {
                process: "PreProcessor.updateAggregation",
            }
        });
    }

    Aggregation.getById((error, ag) => {
        if (error) {
            logger.error(error.message, {
                resource: {
                    process: 'AggregationController.getById',
                    params: [Aggregation.data._id]
                },
                detail: {
                    description: error
                }
            }, () => {
                if (!keepRunning) process.exit(1);
            });
        } else {
            Aggregation.data.hasQueue = ag.hasQueue;
            if (ag.hasQueue && Aggregation.data.processStatus === Enumerator.ProcessStatus.FINISHED) {
                Aggregation.data.processStatus = Enumerator.ProcessStatus.RAW;
                Aggregation.data.hasQueue = false;
            }

            Aggregation.update(Aggregation.data, (error) => {
                if (error) {
                    logger.error(error.message, {
                        resource: {
                            process: 'AggregationController.update',
                            params: [Aggregation.data._id]
                        },
                        detail: {
                            description: error
                        }
                    }, () => {
                        if (!keepRunning) process.exit(1);
                    });
                } else {
                    if (!keepRunning) process.exit(exitCode);
                }
            });
        }
    }, null, null, null, null, true);
}

/**
 * Process preparation
 * Check if folders are created in the file system, otherwise, will create with 0777 mod
 * @return {Promise}
 */
function prepare() {
    return new Promise((resolve, reject) => {
        let dOriginal, dEqualized, dResult, dError, dScanned, queue;

        dOriginal = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.ORIGINAL);
        dEqualized = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.EQUALIZED);
        dResult = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.RESULT);
        dScanned = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.SCANNED);
        if (Config.DeveloperDebug) dError = path.normalize(Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.ERROR);
        queue = [];

        queue.push((_c) => {
            if (!fs.existsSync(dOriginal)) {
                fs.mkdir(dOriginal, '0777', (err) => {
                    if (err) _c(err);
                    else _c();
                })
            } else _c();
        });

        queue.push((_c) => {
            if (!fs.existsSync(dEqualized)) {
                fs.mkdir(dEqualized, '0777', (err) => {
                    if (err) _c(err);
                    else _c();
                })
            } else _c();
        });

        queue.push((_c) => {
            if (!fs.existsSync(dResult)) {
                fs.mkdir(dResult, '0777', (err) => {
                    if (err) _c(err);
                    else _c();
                })
            } else _c();
        });

        queue.push((_c) => {
            if (!fs.existsSync(dScanned)) {
                fs.mkdir(dScanned, '0777', (err) => {
                    if (err) _c(err);
                    else _c();
                })
            } else _c();
        });

        if (Config.DeveloperDebug) {
            queue.push((_c) => {
                if (!fs.existsSync(dError)) {
                    fs.mkdir(dError, '0777', (err) => {
                        if (err) _c(err);
                        else _c();
                    })
                } else _c();
            });
        }

        async.parallel(queue, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        })
    })
}

prepare()
    .then(() => {
        if (Config.DeveloperDebug) {
            let Generator = require('./class/Generator');
            Generator.Run(run);
        } else {
            run();
        }
    })
    .catch((error) => {
        logger.error(error.message, {
            resource: {
                process: 'PreProcessor.prepare',
                params: [Aggregation.data._id]
            },
            detail: {
                description: error
            }
        }, () => {
            process.exit(1);
        });
    });