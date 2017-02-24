'use strict';

const SMTPServer = require('smtp-server').SMTPServer;
const MailParser = require("mailparser").MailParser;
const fs = require('fs');
const path = require('path');
const uuid = require('node-uuid');
const service = require('../api/services/auth');


module.exports = () => {

    // ************** Mail Parser init *****************
    var mailparser = new MailParser();
    mailparser.on("end", function(mail_object){
        mail_object.attachments.map(function (item) {
            return fs.writeFile('1_' + item.fileName, item.content, (err) => {
                if (err) throw err;
                console.log('1_' + item.fileName + ' saved!');
            });
        })
    });

    // ************** SMTP server init ******************
    var server = new SMTPServer({
        authMethods: ['PLAIN', 'LOGIN'],
        disabledCommands: ['STARTTLS'],
        allowInsecureAuth: true,
        logger: true,
        onAuth: (auth, session, callback) => {
            service.authenticate({login: auth.username, password: auth.password}, (result, status) => {
                if (result.code == 20000) {
                    return callback(null, {user: 123});
                }
                else {
                    return callback(new Error('Invalid username or password'));
                }
            })
        },
        onConnect: (session, callback) => { return callback(); }, // Accept the connection
        onMailFrom: (address, session, callback) => {
            return callback(); // Accept the address
        },
        onRcptTo: (address, session, callback) => {
            return callback(); // Accept the address
        },
        onData: (stream, session, callback) => {
            session.id = uuid.v4();
            var mailPath = path.join('.tmp', session.id);
            session.mailPath = mailPath;

            stream.pipe(fs.createWriteStream(mailPath));
            stream.on('end', () => {
                fs.createReadStream(session.mailPath).pipe(mailparser);
                return callback()
            });
        },
        onClose: (session) => { }
    });

    // Errors listner
    server.on('error', function(err){
        console.log('Error %s', err.message);
    });

    // Request listener
    return server.listen(25);
}
