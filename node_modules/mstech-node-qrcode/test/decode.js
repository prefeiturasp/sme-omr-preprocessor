'use strict';
const path = require('path');
const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
const qrcode = require('../lib/decode');

var bin = __dirname.replace('\\test', '\\bin');
var testResource = path.normalize(`${__dirname}/resource/`);
bin = path.normalize(`${bin}/zxing.exe`);

chai.should();
chai.use(chaiAsPromised);

describe('QRCode decoder', () => {
    describe('Bin and File param empty', () => {
        it('Should be invalid', () => {
            return qrcode().should.be.rejectedWith(Error);
        })
    });

    describe('File param empty', () => {
        it('Should be invalid', () => {
            return qrcode(bin).should.be.rejectedWith(Error);
        })
    });

    describe('Bin param empty', () => {
        it('Should be invalid', () => {
            return qrcode(null, '').should.be.rejectedWith(Error);
        })
    });

    describe('Invalid Bin param', () => {
        it('Should be invalid', () => {
            return qrcode('./decode.js', './resource/valid.jpg').should.be.rejectedWith(Error);
        })
    });

    describe('Invalid File param', () => {
        it('Should do nothing', () => {
            return qrcode(bin, 'myfile').should.become('');
        })
    });

    describe('Image with valid QRCode', () => {
        it('Should be valid', () => {
            return qrcode(bin, `${testResource}valid.jpg`).should.be.fulfilled;
        })
    });

    describe('Image with invalid QRCode', () => {
        it('Should be invalid', () => {
            return qrcode(bin, `${testResource}force.jpg`).should.be.rejectedWith(Error);
        })
    });

    describe('Image with valid QRCode with --try-harder', () => {
        it('Should be valid', () => {
            return qrcode(bin, `${testResource}force.jpg`, true).should.be.fulfilled;
        })
    });

    describe('Image with invalid QRCode with', () => {
        it('Should be invalid', () => {
            return qrcode(bin, `${testResource}invalid.jpg`).should.be.rejectedWith(Error);
        })
    });

    describe('Image with invalid QRCode with --try-harder', () => {
        it('Should be invalid', () => {
            return qrcode(bin, `${testResource}invalid.jpg`, true).should.be.rejectedWith(Error);
        })
    });
});