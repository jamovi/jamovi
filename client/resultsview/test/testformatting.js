'use strict';

var expect = require('chai').expect;
var mocha = require('mocha');


var determFormat = require('../formatting.js').determFormat;
var format = require('../formatting.js').format;

var tests = [
    { v : [100, 200, 100], r : { dp : 0, expw: NaN } },
    { v : [1, 10, 100],    r : { dp : 2, expw: NaN } },
    { v : [1, 0, 0.1],     r : { dp : 3, expw: NaN } },
    { v : [1, 10, 100],    r : { dp : 2, expw: NaN } },
    { v : [1, 0, 0.001],   r : { dp : 5, expw: NaN } },
    { v : [ 0 ],           r : { dp : 2, expw: NaN } },
    { v : [ 1090, 1000 ],  r : { dp : 0, expw: NaN } },
    { v : [ Infinity, 10 ],r : { dp : 1, expw: NaN } },
    { v : [ 100, 1 ], sf: 5, r : { dp : 4, expw: NaN } },
    { v : [ 100, 1e10, 1.3e100 ], r : { dp : 0, expw: 3 } },
    { v : [ 1e-5, 1e-10, 1e-200 ], r : { dp : 2, expw: 3 } },
    { v : [ 1e1, 1e-300 ], r : { dp : 1, expw: 3 } },
    { v : [0.337, -58.99, -12.3],   r : { dp : 3, expw: NaN } },
    { v : [-1, 0, -0.66],   r : { dp : 3, expw: NaN } },
    { v : [ -1e-5, 8.66e-33, -77e50], r : { dp : 2, expw: 2 } },
     ];

tests.forEach(function(test) {

    mocha.describe('determFormat(' + JSON.stringify(test.v) + ')', function() {

        mocha.it('should be ' + JSON.stringify(test.r), function() {
            expect(determFormat(test.v, test.sf)).to.deep.equal(test.r);
        });
    });
});

tests = [
    {v : 100 , f : { dp : 0, expw: NaN }, r : "100" },
    {v : 0.1 , f : { dp : 3, expw: NaN }, r : "0.100" },
    {v : 0.001 , f : { dp : 4, expw: NaN }, r : "0.0010" },
    {v : 1000 , f : { dp : 2, expw: NaN }, r : "1000.00" },
    {v : 1e10 , f : { dp : 2, expw: 2 }, r : "1.00e+10" },
    {v : 1.4e20 , f : { dp : 2, expw: 3 }, r : "1.40e +20" },
    {v : 1e-5 , f : { dp : 2, expw: 3 }, r : "1.00e  -5" },
    {v : -1e-5 , f : { dp : 2, expw: 3 }, r : "-1.00e  -5" },
    {v : 0 , f : { dp : 2, expw: 0 }, r : "0.00" }
    ];

    tests.forEach(function(test) {

    mocha.describe('determFormat(' + JSON.stringify(test.v) + ')', function() {

        mocha.it('should be ' + JSON.stringify(test.r), function() {
            expect(format(test.v, test.f)).to.eql(test.r);
        });
    });
});
