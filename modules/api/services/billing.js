'use strict'
var db = require('../../../index');
const fs = require('fs');
const jwt = require('jsonwebtoken'); // JSON Web Token
const pdf = require('html-pdf'); // HTML to PDF convert module
const pdfConverterOptions = { format: 'Letter' }; // HTML to PDF options

// For passwords hashing
const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = {
    updateUserBilling: (response) => {
        let login = response.orderID.split('_')[0].toLowerCase();
        let col = db.connection.collection('bills');

        if (Number(response.STATUS) != 5) {
            return console.log('Billing update refused, because payment status is ' + response.STATUS);
        }

        let amount = Number(response.amount);
        let record = {
            id: response.orderID,
            currency: response.currency,
            amount: response.amount,
            payment_type: response.PM,
            card_num: response.CARDNO,
            date: new Date(),
            type: 'Refill account'
        }

        col.findOneAndUpdate({_id: login }, { $push: { history: record }, $inc: {balance: amount} }, {}, (err, result) => {
            if (err) { console.log(err) }
        })
    },
    getUserBillingInfo: (user, query, callback) => {
        let col = db.connection.collection('bills');
        let login = (user.user).toString().toLowerCase();

        let page = Number(query.page);
        let count = Number(query.count);

        if (count > 30)
            return callback({message: 'You can\'t load more than 10 records per page', code: 40000}, 400);

        col.aggregate([
            { $match: { _id : login } },
            { $unwind: '$history' },
            { $sort: { 'history.date': -1 } },
            { $skip: (page - 1) * count },
            { $limit: count }
        ], (err, r) => {
            if (r.length == 0) {
                return col.find({_id: login}).limit(1).next((err, docs) => {
                    return callback({code: 20000, data: {balance: docs.balance, history: new Array()}})
                })
            }

            let response = {
                balance: r[0].balance,
                history: new Array()
            }

            r.forEach((item, i, arr) => { response.history.push(item.history); })
            callback({code: 20000, data: response});
        })
    }
}
