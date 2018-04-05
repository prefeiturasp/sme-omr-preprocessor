'use strict';
const CPUCount = require('os').cpus().length;
const Enumerator = require('../class/Enumerator');
const Config = require('../config/Config');
const AggregationBO = require('../lib/omr-base/business/Aggregation.bo');;
const ExamBO = require('../lib/omr-base/business/Exam.bo');

const aggregation = new AggregationBO();

class AggregationController {

    /**
     * Get total loaded exams
     * This total doesn't decrement, if the aggregation has 100 exams when service starts,
     * AggregationController.totalExams will be 100 at the end of the execution
     * @return {Number}
     */
    static get totalExams() {
        return AggregationController._totalExams;
    }

    /**
     * Get exam count
     * @return {Number}
     */
    static get examCount() {
        return AggregationController._examCount;
    };

    /**
     * Set exam count
     * @param value {Number}
     */
    static set examCount(value) {
        AggregationController._examCount = value;
    }

    /**
     * Set error count
     * @return {Number}
     */
    static get errorCount() {
        return AggregationController._errorCount;
    }

    /**
     * Set error count
     * @param value {Number}
     */
    static set errorCount(value) {
        AggregationController._errorCount = value;
    }


    /**
     * Set absence count
     * @return {Number}
     */
    static get absenceCount() {
        return AggregationController._absenceCount;
    }

    /**
     * Set absence count
     * @param value {Number}
     */
    static set absenceCount(value) {
        AggregationController._absenceCount = value;
    }

    /**
     * Increment current error count
     * @return {Number} AggregationController.errorCount + 1
     */
    static incrementErrorCount() {
        AggregationController._errorCount += 1;
        return AggregationController._errorCount;
    }

    /**
     * Increment current absence count
     * @return {Number} AggregationController.absenceCount + 1
     */
    static incrementAbsenceCount(){
        AggregationController._absenceCount += 1;
        return AggregationController._absenceCount;
    }

    /**
     * Get next free aggregation
     * @param callback {Function}
     */
    static getNext(callback) {
        AggregationController.examCount = 0;
        AggregationController._totalExams = 0;

        aggregation.GetCount({
            $or: [
                {processStatus: Enumerator.ProcessStatus.DOWNLOADING},
                {processStatus: Enumerator.ProcessStatus.PRE_PROCESSING}
            ]
        }, (error, count) => {
            var where = {};
            if (error) return callback(error);

            if (count >= CPUCount) return callback();

            if (Config.DeveloperDebug) {
                count = null;
                where = {};
            } else {
                where = {
                    processStatus: Enumerator.ProcessStatus.RAW
                };
            }

            aggregation.GetByQuery(
                where,
                '_template externalId processStatus exam hasQueue paginate',
                1,
                '+alterationDate',
                (error, data) => {
                    if (error) return callback(error);
                    if (data.length == 0) return callback();

                    data[0].processStatus = Enumerator.ProcessStatus.DOWNLOADING;
                    AggregationController.data = data[0];

                    aggregation.Update(data[0]._id, data[0], (err) => {
                        if (err) return callback(err);
                        return callback(null, data[0]);
                    });
                },
                null, null, '_template.ref', null, undefined, true
            );
        })
    }

    /**
     * Get exam list for the current aggregation
     * @param callback {Function}
     */
    static getExamList(callback) {
        const exam = new ExamBO();
        var where = {
            _aggregation: AggregationController.data._id,
            processStatus: Enumerator.ProcessStatus.RAW
        };

        exam.GetByQuery(
            where,
            '_aggregation externalId owner processStatus fileExtension',
            null, null, (error, examList) => {
                if (error) return callback(error);

                AggregationController.examCount = examList.length;
                AggregationController._totalExams = examList.length;
                AggregationController.errorCount = 0;
                AggregationController.absenceCount = 0;

                callback(null, examList);
            }, null, null, null, null, undefined, true
        );
    }

    /**
     * Get aggregation by current id
     * @param callback {Function}
     * @param parentField {String=}
     * @param parentValue {String=}
     * @param populateRefs {String=}
     * @param populateFields {String=}
     * @param lean {Boolean=}
     */
    static getById(callback, parentField, parentValue, populateRefs, populateFields, lean) {
        aggregation.GetById(AggregationController.data._id, callback, parentField, parentValue, populateRefs, populateFields, lean);
    }

    /**
     * Update current aggregation
     * @param data {Object}
     * @param callback {Function}
     */
    static update (data, callback) {
        aggregation.Update(AggregationController.data._id, data, callback);
    }
}

module.exports = AggregationController;
