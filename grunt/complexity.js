"use strict";
module.exports = {
    optimal: {
        src: '<%= path.src %>/**/*.js',
        options: {
            breakOnErrors: true,
            errorsOnly: false,
            cyclomatic: [3, 7, 12],
            halstead: [8, 13, 20],
            maintainability: 100,
            hideComplexFunctions: true,
            broadcast: true
        }
    },
    'optimal-full': {
        src: '<%= path.src %>/**/*.js',
        options: {
            breakOnErrors: true,
            errorsOnly: false,
            cyclomatic: [3, 7, 12],
            halstead: [8, 13, 20],
            maintainability: 100,
            hideComplexFunctions: false,
            broadcast: false
        }
    },
    regular: {
        src: '<%= path.src %>/**/*.js',
        options: {
            breakOnErrors: true,
            jsLintXML: '<%= path.docs %>/report/complexity/jsLint.xml',
            checkstyleXML: '<%= path.docs %>/report/complexity/checkstyle.xml',
            pmdXML: '<%= path.docs %>/report/complexity/pmd.xml',
            errorsOnly: false,
            cyclomatic: [4, 8, 12],
            halstead: [10, 15, 20],
            maintainability: 80,
            hideComplexFunctions: true,
            broadcast: true
        }
    },
    'regular-full': {
        src: '<%= path.src %>/**/*.js',
        options: {
            breakOnErrors: true,
            jsLintXML: '<%= path.docs %>/report/complexity/jsLint.xml',
            checkstyleXML: '<%= path.docs %>/report/complexity/checkstyle.xml',
            pmdXML: '<%= path.docs %>/report/complexity/pmd.xml',
            errorsOnly: false,
            cyclomatic: [4, 8, 12],
            halstead: [10, 15, 20],
            maintainability: 80,
            hideComplexFunctions: false,
            broadcast: false
        }
    }
};