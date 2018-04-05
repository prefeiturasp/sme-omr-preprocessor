'use strict';
var BaseEnumerator = require('../lib/omr-base/class/Enumerator');

class Enumerator extends BaseEnumerator {

    static get ClusterCommand() {
        return {
            GET_AGGREGATION: 0,
            _regex: /0/
        }
    }
}

module.exports = Enumerator;