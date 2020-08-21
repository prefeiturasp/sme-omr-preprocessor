'use strict';

let fs = require('fs');
let Canvas = require('canvas');
let ExamBO = require('../lib/omr-base/business/Exam.bo');
let jsfeat = require('jsfeat');
let WorkerManager = require('../lib/omr-base/worker/WorkerManager');
let Enumerator = require('../class/Enumerator');
let Config = require('../config/Config');
let path = require('path');
let ImageMagick = require('gm').subClass({ imageMagick: true, appPath: Config.ImageMagickPath });
let QRCode = require('mstech-node-qrcode');

class ExamController {

    /**
     * Constructor ExamController
     * @param exam {Object}
     */
    constructor(template, exam) {
        this.BO = new ExamBO();
        this.exam = exam;
        this.template = template;
        this.canvas = new Canvas(1275, 1650);
        this.context = this.canvas.getContext("2d");
        this.pixelCorners = {
            topLeft: {
                x: 1000,
                y: 1000
            },
            topRight: {
                x: 0,
                y: 1000
            },
            bottomLeft: {
                x: 1000,
                y: 0
            },
            bottomRight: {
                x: 0,
                y: 0
            },
            baseX: 0,
            baseY: 0,
            baseWidth: 0,
            baseHeight: 0,
            baseWidthWithOffset: 0,
            baseHeightWithOffset: 0,
            tileWidth: 0,
            tileHeight: 0,
            tileOffsetX: 1,
            tileOffsetY: 0
        };
        this.jsfeat = {
            instance: jsfeat,
            corners: [],
            countCorners: 0
        };
        this.image = {};
        this.orientation = "LANDSCAPE";
        this.wM = new WorkerManager();
        process["Exam"] = this.exam;
    }

    /**
     * @param callback
     * @param qrCode
     * @param templateRef
     */
    startProcessing(callback, qrCode, templateRefExternalId) {

        this.callback = callback;
        this.qrCode = qrCode;
        this.dEqualized = path.normalize(
            Config.FileResource.PATH.BASE +
            Config.FileResource.DIRECTORY.EQUALIZED);

        this.dOriginal = path.normalize(
            Config.FileResource.PATH.BASE +
            Config.FileResource.DIRECTORY.ORIGINAL + '/' +
            this.exam._id);

        if (this.qrCode) {
            this.startProcessingQrCode(templateRefExternalId);
        } else {
            this.startProcessingManualIdentification();
        }

        this.startAbsenceProcessing();

        this.wM.RunJob(this.JobCallback.bind(this));
    }

    /**
     * Starts processing the student's absence ID
     */
    startAbsenceProcessing() {

        /**
         * name: IMG_LOAD_FILE
         */
        this.wM.Push({
            name: "IMG_LOAD_FILE",
            depends: WorkerManager.JobList.DetectQRCode,
            job: (function () {
                let _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {

                        ExamController.getFile(this.exam, (err, data) => {
                            if (err) return _c(err);

                            this.image.data = data;
                            _c();
                        })

                    }.bind(this)
                }
            }.bind(this))()
        });

        /**
         * name: DrawImage
         * depends: IMG_LOAD_FILE
         */
        this.wM.Push({
            name: WorkerManager.JobList.DrawImage,
            job: WorkerManager.JobList.DrawImage,
            depends: "IMG_LOAD_FILE",
            params: [
                this.canvas,
                this.context,
                Canvas.Image,
                this.image
            ]
        });

        /**
         * name: FindClippingPoint
         * depends: DrawImage
         */
        this.wM.Push({
            name: WorkerManager.JobList.FindClippingPoint,
            job: WorkerManager.JobList.FindClippingPoint,
            params: [
                this.canvas,
                this.context,
                this.image,
                Canvas.Image,
                Config
            ],
            depends: WorkerManager.JobList.DrawImage
        });

        /**
         * name: CropImage
         * depends: FindClippingPoint
         */
        this.wM.Push({
            name: WorkerManager.JobList.CropImage,
            job: WorkerManager.JobList.CropImage,
            params: [
                this.canvas,
                this.context,
                this.image,
                Config.CropRate.X,
                Config.CropRate.Y,
                Config.CropRate.WIDTH,
                Config.CropRate.HEIGHT
            ],
            depends: WorkerManager.JobList.FindClippingPoint
        });

        /**
         * name: ImageBin
         * depends: CropImage
         */
        this.wM.Push({
            name: WorkerManager.JobList.ImageBin,
            job: WorkerManager.JobList.ImageBin,
            params: [
                this.context,
                this.image
            ],
            depends: WorkerManager.JobList.CropImage
        });

        /**
         * name: PrepareCornerDetectionAlign
         * depends: ImageBin
         */
        this.wM.Push({
            name: WorkerManager.JobList.PrepareCornerDetection + "Align",
            job: WorkerManager.JobList.PrepareCornerDetection,
            params: [
                this.canvas,
                this.jsfeat,
                this.image
            ],
            depends: WorkerManager.JobList.ImageBin
        });

        /**
         * name: DetectCornerAlign
         * depends: PrepareCornerDetectionAlign
         */
        this.wM.Push({
            name: WorkerManager.JobList.DetectCorner + "Align",
            job: WorkerManager.JobList.DetectCorner,
            params: [
                this.canvas,
                this.context,
                this.image,
                this.jsfeat,
                false
            ],
            depends: WorkerManager.JobList.PrepareCornerDetection + "Align"
        });

        /**
         * name: FilterCorner
         * depends: DetectCornerAlign
         */
        this.wM.Push({
            name: WorkerManager.JobList.FilterCorner + "Align",
            job: WorkerManager.JobList.FilterCorner,
            params: [
                this.canvas,
                this.jsfeat,
                this.pixelCorners,
                {
                    questions: 1,
                    alternatives: 1,
                    columns: 1,
                    lines: 1,
                    items: [""]
                },
                Config.TemplateOffset
            ],
            depends: WorkerManager.JobList.DetectCorner + "Align"
        });

        /**
         * name: AlignImage
         * depends: FilterCornerAlign
         */
        this.wM.Push({
            name: WorkerManager.JobList.AlignImage,
            job: WorkerManager.JobList.AlignImage,
            params: [
                this.canvas,
                this.context,
                Canvas,
                this.jsfeat,
                this.image,
                this.pixelCorners
            ],
            depends: WorkerManager.JobList.FilterCorner + "Align"
        });

        /**
         * name: PrepareCornerDetection
         * depends: AlignImage
         */
        this.wM.Push({
            name: WorkerManager.JobList.PrepareCornerDetection,
            job: WorkerManager.JobList.PrepareCornerDetection,
            params: [
                this.canvas,
                this.jsfeat,
                this.image
            ],
            depends: WorkerManager.JobList.AlignImage
        });

        /**
         * name: DetectCorner
         * depends: PrepareCornerDetection
         */
        this.wM.Push({
            name: WorkerManager.JobList.DetectCorner,
            job: WorkerManager.JobList.DetectCorner,
            params: [
                this.canvas,
                this.context,
                this.image,
                this.jsfeat,
                false
            ],
            depends: WorkerManager.JobList.PrepareCornerDetection
        });

        /**
         * name: FilterCorner
         * depends: DetectCorner
         */
        this.wM.Push({
            name: WorkerManager.JobList.FilterCorner,
            job: WorkerManager.JobList.FilterCorner,
            params: [
                this.canvas,
                this.jsfeat,
                this.pixelCorners,
                {
                    questions: 1,
                    alternatives: 1,
                    columns: 1,
                    lines: 1,
                    items: [""]
                },
                Config.TemplateOffset
            ],
            depends: WorkerManager.JobList.DetectCorner
        });

        /**
         * name: ValidateTemplateAbsence
         * depends: FilterCorner
         */
        this.wM.Push({
            name: WorkerManager.JobList.ValidateTemplate + "Absence",
            job: WorkerManager.JobList.ValidateTemplate,
            params: [
                Canvas,
                this.context,
                this.pixelCorners,
                {
                    questions: 1,
                    alternatives: 1,
                    columns: 1,
                    lines: 1,
                    items: [""]
                },
                Config.TemplateOffset
            ],
            depends: WorkerManager.JobList.FilterCorner
        });

        /**
         * name: VerifyTemplateFill
         * depends: WorkerManager.JobList.ValidateTemplateAbsence
         */
        this.wM.Push({
            name: WorkerManager.JobList.VerifyTemplateFill,
            job: WorkerManager.JobList.VerifyTemplateFill,
            params: [
                this.canvas,
                this.context,
                this.image,
                {
                    questions: 1,
                    alternatives: 1,
                    columns: 1,
                    lines: 1,
                    items: [""]
                },
                this.pixelCorners,
                this.orientation
            ],
            depends: WorkerManager.JobList.ValidateTemplate + "Absence"
        });

        /**
         * name: checkTemplateAnswers
         * depends: VerifyTemplateFill
         */
        this.wM.Push({
            name: "checkTemplateAnswers",
            depends: WorkerManager.JobList.VerifyTemplateFill,
            job: (function () {
                let _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {

                        let insertedAnswers = Data.insertedAnswers[0];
                        this.exam.absence = !insertedAnswers.inconsistency && insertedAnswers.alternative === 0;

                        _c();

                    }.bind(this)
                }
            }.bind(this))()
        });

        /**
         * name: DB_SET_PENDING
         * depends: EqualizeImage
         */
        this.wM.Push({
            name: "DB_SET_PROCESS_STATUS",
            depends: "checkTemplateAnswers",
            job: (function () {
                let _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {

                        if (this.exam.absence) {
                            this.exam.processStatus = Enumerator.ProcessStatus.ABSENCE;
                        } else {
                            this.exam.processStatus = Enumerator.ProcessStatus.PENDING;
                        }

                        _c();
                    }.bind(this)
                }
            }.bind(this))()
        });

        /**
         * name: DrawGrid
         * depends: ValidateTemplate
         */
        // this.wM.Push({
        //     name: WorkerManager.JobList.DrawGrid,
        //     job: WorkerManager.JobList.DrawGrid,
        //     params: [
        //         this.context,
        //         this.pixelCorners
        //     ],
        //     depends: "checkTemplateAnswers"
        // });

        /**
         * name: DEBUG_SAVE_IMAGE
         */
        // this.wM.Push({
        //     name: "DEBUG_SAVE_IMAGE",
        //     depends:  WorkerManager.JobList.VerifyTemplateFill,
        //     job: (function () {
        //         let _c, Data;
        //         return {
        //             Config: function (_callback, _sharedData) {
        //                 _c = _callback;
        //                 Data = _sharedData;
        //             }.bind(this),
        //             Run: function () {
        //
        //                 this.saveProcessedImage(this.exam, () => {
        //
        //                 });
        //
        //
        //             }.bind(this)
        //         }
        //     }.bind(this))()
        // });
        // return;
    }

    /**
     * Starts processing the owner's qrcode ID
     * @param templateIdRef
     */
    startProcessingQrCode(templateRefExternalId) {

        /**
         * name: DB_SET_PRE-PROCESSING
         */
        this.wM.Push({
            name: "DB_SET_PRE-PROCESSING",
            job: (function () {
                let _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {

                        this.exam.processStatus = Enumerator.ProcessStatus.PRE_PROCESSING;
                        this.Update(this.exam, _c);

                    }.bind(this)
                }
            }.bind(this))()
        });
        /**
         * name: EqualizeImage
         * depends: DetectQRCode
         */
        this.wM.Push({
            name: WorkerManager.JobList.EqualizeImage,
            job: WorkerManager.JobList.EqualizeImage,
            depends: "DB_SET_PRE-PROCESSING",
            params: [
                ImageMagick,
                this.dOriginal + '.' + this.exam.fileExtension,
                this.dEqualized,
                {
                    w: 72,
                    h: 72
                },
                {
                    w: 595,
                    h: 842
                },
                2,
                1,
                null,
                40
            ]
        });
        /**
         * name: DetectQRCode
         * depends: CropImage
         */
        this.wM.Push({
            name: WorkerManager.JobList.DetectQRCode,
            job: WorkerManager.JobList.DetectQRCode,
            depends: WorkerManager.JobList.EqualizeImage,
            params: [
                this.dEqualized + '/' + this.exam._id + '.' + Enumerator.FileExtensions.PNG,
                QRCode,
                this.exam,
                templateRefExternalId,
                true
            ]
        });
    }

    /**
     * Starts processing the owner's manual ID
     */
    startProcessingManualIdentification() {

        /**
         * name: DB_SET_PRE-PROCESSING
         */
        this.wM.Push({
            name: "DB_SET_PRE-PROCESSING",
            job: (function () {
                var _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {

                        this.exam.processStatus = Enumerator.ProcessStatus.PRE_PROCESSING;
                        this.Update(this.exam, _c);

                    }.bind(this)
                }
            }.bind(this))()
        });
        /**
         * name: EqualizeImage
         * depends: DB_SET_PRE-PROCESSING
         */
        this.wM.Push({
            name: WorkerManager.JobList.EqualizeImage,
            job: WorkerManager.JobList.EqualizeImage,
            depends: "DB_SET_PRE-PROCESSING",
            params: [
                ImageMagick,
                this.dOriginal,
                this.dEqualized,
                {
                    w: 72,
                    h: 72
                },
                {
                    //w: 595,
                    //h: 842

                    w: 20,
                    h: 20
                },
                2,
                1
            ]
        });
        /**
         * name: GET_IMAGE_FILE
         * depends: EqualizeImage
         */
        this.wM.Push({
            name: "GET_IMAGE_FILE",
            depends: WorkerManager.JobList.EqualizeImage,
            job: (function () {
                var _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {

                        ExamController.getFile(this.dEqualized + '/' + this.exam._id + '.' + Enumerator.FileExtensions.PNG,
                            function (err, content) {

                                if (err) _c(err);
                                else {
                                    this.image.data = content;
                                    _c();
                                }
                            }.bind(this));

                    }.bind(this)
                }
            }.bind(this))()
        });
        /**
         * name: DrawImage
         * depends: GET_IMAGE_FILE
         */
        this.wM.Push({
            name: WorkerManager.JobList.DrawImage,
            job: WorkerManager.JobList.DrawImage,
            params: [
                this.canvas,
                this.context,
                Canvas.Image,
                this.image
            ],
            depends: "GET_IMAGE_FILE"
        });

        /**
         * name: FindClippingPoint
         * depends: DrawImage
         */
        this.wM.Push({
            name: WorkerManager.JobList.FindClippingPoint,
            job: WorkerManager.JobList.FindClippingPoint,
            params: [
                this.canvas,
                this.context,
                this.image,
                Canvas.Image,
                Config
            ],
            depends: WorkerManager.JobList.DrawImage
        });

        /**
         * name: CropImage
         * depends: FindClippingPoint
         */
        this.wM.Push({
            name: WorkerManager.JobList.CropImage,
            job: WorkerManager.JobList.CropImage,
            params: [
                this.canvas,
                this.context,
                this.image,
                Config.CropRate.X,
                Config.CropRate.Y,
                Config.CropRate.WIDTH,
                Config.CropRate.HEIGHT
            ],
            depends: WorkerManager.JobList.FindClippingPoint
        });
        /**
         * name: PrepareCornerDetection
         * depends: CropImage
         */
        this.wM.Push({
            name: WorkerManager.JobList.PrepareCornerDetection,
            job: WorkerManager.JobList.PrepareCornerDetection,
            params: [
                this.canvas,
                this.jsfeat
            ],
            depends: WorkerManager.JobList.CropImage
        });
        /**
         * name: DetectCorner
         * depends: PrepareCornerDetection
         */
        this.wM.Push({
            name: WorkerManager.JobList.DetectCorner,
            job: WorkerManager.JobList.DetectCorner,
            params: [
                this.canvas,
                this.context,
                this.image,
                this.jsfeat,
                true
            ],
            depends: WorkerManager.JobList.PrepareCornerDetection
        });
        /**
         * name: FilterCorner
         * depends: DetectCorner
         */
        this.wM.Push({
            name: WorkerManager.JobList.FilterCorner,
            job: WorkerManager.JobList.FilterCorner,
            params: [
                this.canvas,
                this.jsfeat,
                this.pixelCorners,
                {
                    alternatives: 2,
                    columns: 1,
                    questions: 10,
                    lines: 1,
                    offset: {
                        width: 3,
                        height: 1
                    }
                },
                Config.TemplateOffset
            ],
            depends: WorkerManager.JobList.DetectCorner
        });
        /**
         * name: ImageBin
         * depends: FilterCorner
         */
        this.wM.Push({
            name: WorkerManager.JobList.ImageBin,
            job: WorkerManager.JobList.ImageBin,
            params: [
                this.context,
                this.image
            ],
            depends: WorkerManager.JobList.FilterCorner
        });
        /**
         * name: ValidateTemplate
         * depends: ImageBin
         */
        this.wM.Push({
            name: WorkerManager.JobList.ValidateTemplate,
            job: WorkerManager.JobList.ValidateTemplate,
            params: [
                Canvas,
                this.context,
                this.pixelCorners,
                {
                    alternatives: 2,
                    columns: 1
                },
                Config.TemplateOffset
            ],
            depends: WorkerManager.JobList.ImageBin
        });
        /**
         * name: DrawGrid
         * depends: ValidateTemplate
         */
        this.wM.Push({
            name: WorkerManager.JobList.DrawGrid,
            job: WorkerManager.JobList.DrawGrid,
            params: [
                this.context,
                this.pixelCorners,
                {
                    alternatives: 10,
                    columns: 1,
                    questions: 2,
                    lines: 1,
                    offset: {
                        width: 3,
                        height: 1
                    }
                },
                this.orientation
            ],
            depends: WorkerManager.JobList.ValidateTemplate
        });
        /**
         * name: VerifyTemplateFill
         * depends: DrawGrid
         */
        this.wM.Push({
            name: WorkerManager.JobList.VerifyTemplateFill,
            job: WorkerManager.JobList.VerifyTemplateFill,
            params: [
                this.canvas,
                this.context,
                this.image,
                {
                    alternatives: 10,
                    columns: 1,
                    questions: 2,
                    lines: 1,
                    offset: {
                        width: 3,
                        height: 1
                    }
                },
                this.pixelCorners,
                this.orientation
            ],
            depends: WorkerManager.JobList.DrawGrid
        });
        /**
         * name: checkTemplateAnswers
         * depends: VerifyTemplateFill
         */
        this.wM.Push({
            name: "checkTemplateAnswers",
            depends: WorkerManager.JobList.VerifyTemplateFill,
            job: (function () {
                let _c, Data;
                return {
                    Config: function (_callback, _sharedData) {
                        _c = _callback;
                        Data = _sharedData;
                    }.bind(this),
                    Run: function () {
                        try {
                            this.exam.processStatus = Enumerator.ProcessStatus.PENDING;
                            this.exam.owner = ExamController.checkTemplateAnswers(Data.insertedAnswers);
                            _c();
                        } catch (err) {
                            _c(err)
                        }

                    }.bind(this)
                }
            }.bind(this))()
        });

        this.wM.RunJob(this.JobCallback.bind(this));

    }

    /**
     * @param err
     */
    JobCallback(err) {
        let errors = [], ret = {};
        if (err) {
            errors.push(err);
            this.exam.processStatus = Enumerator.ProcessStatus.ERROR;
        }

        this.Update(this.exam, (err) => {
            if (err) errors.push(err);

            ret = { ErrorList: errors };
            ret['Exam'] = this.exam;

            if (Config.KeepResults(this.exam.processStatus, Enumerator.ProcessStatus, Enumerator.KeepResultLevel) === true) {
                this.saveProcessedImage(this.exam, function (err) {
                    if (err) errors.push(err);

                    this.callback(null, ret);
                }.bind(this));
            } else this.callback(null, ret);
        });
    }

    /**
     * Save processed image for debug
     * @param exam {Function}
     * @param callback {Function}
     */
    saveProcessedImage(exam, callback) {

        const filePath = Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.RESULT + "/" + exam._id + '.' + Enumerator.FileExtensions.PNG;

        fs.open(filePath, 'w', (error, fd) => {
            if (error) return callback(error);

            this.canvas.toBuffer(function (error, buffer) {
                if (error) return callback(error);

                fs.write(fd, buffer, 0, buffer.length, null, (error) => {
                    if (error) return callback(error);
                    fs.close(fd);
                    return callback();
                })
            });
        });
    }

    /**
     * Get file in path
     * @param exam {Object}
     * @param callback {Function}
     */
    static getFile(exam, callback) {

        let filePath = Config.FileResource.PATH.BASE + Config.FileResource.DIRECTORY.EQUALIZED + "/" + exam._id + '.' + Enumerator.FileExtensions.PNG;

        fs.open(filePath, 'r', (error, fd) => {
            if (error) return callback(error);

            fs.stat(filePath, (error, stat) => {
                let buffer;
                if (error) return callback(error);

                buffer = new Buffer(stat.size);

                fs.read(fd, buffer, 0, buffer.length, null, (error, bytesRead, buffer) => {
                    if (error) return callback(error);
                    fs.close(fd);
                    return callback(null, buffer);
                })
            });
        });
    }

    /**
     * Inserted compare answers with correct answers
     * @param insertedAnswers {Object[]} list of answers
     */
    static checkTemplateAnswers(insertedAnswers) {
        let answers = "",
            len = insertedAnswers.length;

        for (let i = 0; i < len; i++) {
            if (!isNaN(insertedAnswers[i].alternative) && !insertedAnswers[i].inconsistency)
                answers += (insertedAnswers[i].alternative).toString();
        }

        if (answers.trim()) return answers;
        else throw new Error("Owner is Empty");
    }

    /**
     *
     * @param _callback
     * @param physical
     */
    RemoveAll(_callback, physical) {
        this.BO.RemoveByQuery(
            null,
            _callback,
            physical
        );
    }

    /**
     *
     * @param data
     * @param _callback
     */
    Create(data, _callback) {
        this.BO.Create(data, _callback);
    }

    /**
     * Update BO
     * @param exam
     * @param callback
     */
    Update(exam, callback) {
        this.BO.Update(exam._id, exam, callback);
    }

}

module.exports = ExamController;