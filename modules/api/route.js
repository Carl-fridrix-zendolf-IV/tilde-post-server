'use strict'

const util = require('util');
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer'); // For attachment parsing
const cors = require('cors'); // Require ExpressJS CORS module
const upload = multer({ dest: './attachments/', inMemory: true });
const bodyParser = require('body-parser'); // For body in POST request to Express JS
const expressValidator = require('express-validator'); // For request validation
const jwt = require('jsonwebtoken'); // JSON Web Token
const minify = require('html-minifier').minify; // for HTML pages minifying
const app = express();
const PORT = process.env.PORT || 3000;

const authService = require('./services/auth');
const supportService = require('./services/support');
const contactsServices = require('./services/contacts');
const messagesServices = require('./services/messages');
const userService = require('./services/user');
const billingServices = require('./services/billing');

// INTERNAL SERVICES
const intervalServices = require('./services_internal/services');


module.exports = () => {

    // CORS enable
    app.use(cors());

    var requireAuthentication = (req, res, next) => {
        if (req.path == '/' ||
            req.path == '/api/public/v1/registration' ||
            req.path == '/api/public/v1/auth' ||
            req.path == '/api/public/v1/forgot/password' ||
            req.path == '/doc' ||
            req.path == '/api/public/v1/auth/login/available' ||
            req.path == '/api/public/v1/billing/update' ||
            req.path == '/api/public/v1/phone/verify' ||
            req.path == '/api/public/v1/code/verify' ||
            req.path == '/api/public/v1/user/support' ||
            req.path == '/api/public/v1/drop') {
            return next();
        }

        if (req.path.indexOf('doc') > -1 || req.path.indexOf('static') > -1 || req.path.indexOf('pdf') > -1 || req.path.indexOf('internal') > -1) {
            return next();
        }

        var token = req.headers['x-api-auth'];

        if (!token) {
            return res.status(400).json({ message: 'Token must be added in "x-api-auth" request header' });
        }

        try {
            var decoded = jwt.verify(token, global.JWT);
        }
        catch (e) {
            return res.status(400).json({ message: 'Invalid token' });
        }

        next();
    }

    // parse application/x-www-form-urlencoded
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }))
    app.use(bodyParser.json({limit: '50mb'})); // body parser in requests

    app.use(expressValidator()); // validate body and queires in request module
    app.use('/doc', express.static('./apidoc')); // init static folder, which return API docs

    app.all('*', requireAuthentication);

    app.options('*', (req, res) => {
        res.sendStatus(200);
    });

    // API docs static
    app.get('/doc', (req, res) => { res.sendFile('./apidoc/index.html'); })

    app.get('/api/public/v1/drop', (req, res) => {
        supportService.dropCollections((response, status) => {
            res.status(status || 200).json(response);
        })
    })

    app.put('/api/internal/v1/files/save/html', upload.single('html', 1), (req, res) => {
        req.checkBody({
            'type': {
                notEmpty: true,
                errorMessage: '"type" body field couldn\'t be empty'
            },
            'lang': {
                notEmpty: true,
                errorMessage: '"type" body field couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else if (!req.file) {
            return res.status(400).json({message: 'Please attach a file', code: 40000});
        }
        else {
            var buffer = fs.readFileSync(req.file.destination + req.file.filename);
            var name = req.body.type + '_' + req.body.lang + '.html';
            var filename = path.join(process.env.TEMP_DIR || './mockups', name);

            fs.writeFile(filename, buffer, (err) => {
                if (err) {
                    return res.status(500).json(err);
                }

                fs.unlink(req.file.destination + req.file.filename, (err) => { if (err) throw err; });
                res.status(200).json({message: 'ok', filename: name, downloadLink: '/api/internal/v1/files/get/html/' + name});
            });
        }
    })

    /**
    * @api {get} /api/internal/v1/files/get/html/:name Get static pages
    * @apiName Static pages
    * @apiGroup Internal
    *
    * @apiParam {String} name Filename - add as url param. File name scheme: {name}_{lang}.html (for ex. prices_en_GB.html or about_en_US.html)
    * @apiParam {String} type Response type (html or json only!).
    *
    * @apiSuccess {File} file If response type is html.
    * @apiSuccess {String} data Minify html as string if selected json type.
    * @apiSuccess {Number} code Success code if selected json type.
    */
    app.get('/api/internal/v1/files/get/html/:name', (req, res) => {
        req.checkQuery({
            'type': {
                notEmpty: true,
                errorMessage: '"type" body field couldn\'t be empty.'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else if (req.query.type != 'html' && req.query.type != 'json') {
            return res.status(400).json({message: 'Type can be only "html" or "json"', code: 40000});
        }
        else {
            var dir = process.env.TEMP_DIR || './mockups';
            var file = fs.readFileSync(dir + '/' + req.params.name, "utf8");
            var result = minify(file, {
                removeAttributeQuotes: false,
                collapseWhitespace: true,
                html5: true
            });

            if (req.query.type == 'html') {
                var createTmp = fs.writeFileSync('./.tmp/' + req.params.name, result);
                res.status(200).sendFile(req.params.name, {root: '.tmp'});
            }
            else if (req.query.type == 'json') {
                res.status(200).json({html: result, code: 20000});
            }
        }
    })

    // User avatar image
    app.get('/api/public/v1/static/images/:filename', (req, res) => {
        if (!req.params.filename) {
            return res.status(400).json({message: 'Param "filename" couldn\'t be empty'});
        }

        res.sendFile(req.params.filename, {root: process.env.TEMP_DIR});
    })

    /**
    * @api {get} / Main API path
    * @apiName Main
    * @apiGroup Main
    *
    * @apiSuccess {String} message Welcome message.
    */
    app.get('/', (req, res) => {
        res.json({message: 'Welcome to awesome Tilda API, powered by Node JS with Express JS', code: 20000});
    });

    /**
    * @api {get} /api/public/v1/phone/verify Send SMS code
    * @apiName Verify phone
    * @apiGroup Auth and Registration
    *
    * @apiParam {String} phone Phone number.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {String} code Success code.
    */
    app.get('/api/public/v1/phone/verify', (req, res) => {
        // Required params
        req.checkQuery({
            'phone': {
                notEmpty: true,
                errorMessage: 'phone couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var phone = req.query.phone.replace(/\+/g, '');
            req.query.phone = phone.replace(/ /g,"");

            authService.phoneVerify(req.query.phone, (response, status) => {
                res.status(status || 200).json(response);
            })
        }
    })

    /**
    * @api {get} /api/public/v1/code/verify Verify code from SMS
    * @apiName Verify code
    * @apiGroup Auth and Registration
    *
    * @apiParam {String} phone Phone number.
    * @apiParam {String} code Code from SMS.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {String} code Success code.
    */
    app.get('/api/public/v1/code/verify', (req, res) => {
        req.checkQuery({
            'phone': {
                notEmpty: true,
                errorMessage: 'phone couldn\'t be empty' // Error message for the parameter
            },
            'code': {
                notEmpty: true,
                errorMessage: 'code couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var phone = req.query.phone.replace(/\+/g, '');
            req.query.phone = phone.replace(/ /g,"");

            authService.codeVerify(req.query, (response, status) => {
                res.status(status || 200).json(response);
            })
        }
    })

    /**
    * @api {PUT} /api/public/v1/registration Registration in Tilda System
    * @apiName Registration
    * @apiGroup Auth and Registration
    *
    * @apiParam {String} first_name User firstname.
    * @apiParam {String} last_name User lastname.
    * @apiParam {String} login User login name.
    * @apiParam {String} birthday User birthday.
    * @apiParam {String} password User password to account.
    * @apiParam {Array} addresses User addresses. List of objects.
    * @apiParam {String} phone_number Phone number with region code and without plus symbol.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.put('/api/public/v1/registration', (req, res) => {
        req.checkBody({
            'first_name': {
                notEmpty: true,
                errorMessage: '"first_name" body field couldn\'t be empty' // Error message for the parameter
            },
            'last_name': {
                notEmpty: true,
                errorMessage: '"last_name"  body field couldn\'t be empty'
            },
            'login': {
                notEmpty: true,
                errorMessage: '"login" body field couldn\'t be empty'
            },
            'birthday': {
                notEmpty: true,
                errorMessage: '"birthday" body field couldn\'t be empty'
            },
            'password': {
                notEmpty: true,
                errorMessage: '"password" body field couldn\'t be empty'
            },
            'addresses': {
                notEmpty: true,
                errorMessage: '"address" body field couldn\'t be empty'
            },
            'phone_number': {
                notEmpty: true,
                isLength: {
                    options: [{ min: 5 }],
                    errorMessage: '"phone_number" must be more than 5 chars long'
                },
                errorMessage: '"phone_number" body field couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else if (
            !req.body.addresses[0].post_code ||
            !req.body.addresses[0].country ||
            !req.body.addresses[0].city ||
            !req.body.addresses[0].address
        ) {
            return res.status(400).json({
                message: 'Addresses have required fields',
                code: 40000,
                fields: {
                    post_code: "{string} - user address",
                    country: "{string} - user country",
                    city: "{string} - user city",
                    type: "{string} - OPTIONAL if not exist on first item of list, will be set \"HOME\" address type"
                }
            });
        }
        else {
            req.body.phone_number = req.body.phone_number.replace(/\+/g,'');
            authService.addUser(req.body, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/auth/login/available Check login available
    * @apiName Login available
    * @apiGroup Auth and Registration
    *
    * @apiParam {String} login User login name.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Success code.
    */
    app.get('/api/public/v1/auth/login/available', (req, res) => {
        // Required params
        req.checkQuery({
            'login': {
                notEmpty: true,
                errorMessage: 'Login couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            authService.checkLoginAvailable(req.query.login, (response, status) => {
                res.status(status || 200).json(response);
            })
        }
    })

    /**
    * @api {GET} /api/public/v1/auth Auth in Tilda System
    * @apiName Auth
    * @apiGroup Auth and Registration
    *
    * @apiParam {String} login User login.
    * @apiParam {String} password User password.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {String} token Authentication.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/auth', (req, res) => {
        // Required params
        req.checkQuery({
            'login': {
                notEmpty: true,
                errorMessage: 'Login couldn\'t be empty' // Error message for the parameter
            },
            'password': {
                notEmpty: true,
                errorMessage: 'Password couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            authService.authenticate(req.query, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/forgot/password Send user new password via SMS
    * @apiName Forgot password
    * @apiGroup Auth and Registration
    * @apiDescription New password will send on user phone.
    *
    * @apiParam {String} phone User phone number.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/forgot/password', (req, res) => {
        req.checkQuery({
            'phone': {
                notEmpty: true,
                errorMessage: 'Phone couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var phone = req.query.phone.replace(/\+/g, '');
            req.query.phone = phone.replace(/ /g,"");

            authService.forgotPassword(req.query, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/change/password Change user password
    * @apiName Change Password
    * @apiGroup Auth and Registration
    * @apiDescription This method allow only for authorized users
    *
    * @apiParam {String} password New password.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/change/password', (req, res) => {
        req.checkQuery({
            'password': {
                notEmpty: true,
                errorMessage: 'Password couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            authService.changePassword(decoded, req.query, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/contacts/search/user Find user in Tilda system
    * @apiName Find user (Tilda)
    * @apiGroup Contacts
    * @apiDescription This method has limit, only 20 objects for response array
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} search search string.
    *
    * @apiSuccess {Array} data Users list.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/contacts/search/user', (req, res) => {
        req.checkQuery({
            'search': {
                notEmpty: true,
                errorMessage: 'Search couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.searchUser(decoded, req.query.search, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/contacts/search/list Find user in contacts list
    * @apiName Find user (Contacts)
    * @apiGroup Contacts
    * @apiDescription This method has limit, only 20 objects for response array
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} search search string.
    *
    * @apiSuccess {Array} data Users list.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/contacts/search/list', (req, res) => {
        req.checkQuery({
            'search': {
                notEmpty: true,
                errorMessage: 'Search couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.searchInContactsList(decoded, req.query.search, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/contacts/get Get user contacts list
    * @apiName Contacts list
    * @apiGroup Contacts
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} page Optional login, which need to add.
    * @apiParam {String} count user or address post_code.
    *
    * @apiSuccess {Array} data List of contacts.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/contacts/get', (req, res) => {
        req.checkQuery({
            'page': {
                notEmpty: true,
                errorMessage: 'page couldn\'t be empty'
            },
            'count': {
                notEmpty: true,
                errorMessage: 'count couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.getContactsList(decoded, req.query, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/contacts/get/id Get user contacts by ID
    * @apiName Get contact
    * @apiGroup Contacts
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} id Contact login.
    *
    * @apiSuccess {Object} data Contact.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/contacts/get/id', (req, res) => {
        req.checkQuery({
            'id': {
                notEmpty: true,
                errorMessage: 'id couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.getContactById(decoded, req.query.id, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {POST} /api/public/v1/contacts/push Add to contacts list
    * @apiName Add to contacts
    * @apiGroup Contacts
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} contact_login Optional if you enter custom address.
    * @apiParam {String} post_code Required for custom address records.
    * @apiParam {String} country  Required for custom address records.
    * @apiParam {String} city  Required for custom address records.
    * @apiParam {String} address  Required for custom address records.
    * @apiParam {String} first_name  Required for custom address records.
    * @apiParam {String} last_name  Required for custom address records.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.post('/api/public/v1/contacts/push', (req, res) => {
        if (!req.body.contact_login) {
            req.checkBody({
                'post_code': {
                    notEmpty: true,
                    errorMessage: '"post_code" body field couldn\'t be empty'
                },
                'country': {
                    notEmpty: true,
                    errorMessage: '"country" body field couldn\'t be empty'
                },
                'city': {
                    notEmpty: true,
                    errorMessage: '"city" body field couldn\'t be empty'
                },
                'address': {
                    notEmpty: true,
                    errorMessage: '"address" body field couldn\'t be empty'
                },
                'first_name': {
                    notEmpty: true,
                    errorMessage: '"first_name" body field couldn\'t be empty'
                },
                'last_name': {
                    notEmpty: true,
                    errorMessage: '"last_name" body field couldn\'t be empty'
                }
            });
        }
        else {
            req.checkBody({
                'contact_login': {
                    notEmpty: true,
                    errorMessage: '"contact_login" body field couldn\'t be empty'
                }
            })
        }

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.addContact(decoded, req.body, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {POST} /api/public/v1/contacts/edit Update contact
    * @apiName Update contact
    * @apiGroup Contacts
    * @apiDescription This method available only for custom addresses
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} contact User login or custom address ID, which need to remove - body field.
    * @apiParam {String} [post_code] user or address post_code body field.
    * @apiParam {String} [country] user or address country body field.
    * @apiParam {String} [city] user or address city body field.
    * @apiParam {String} [address] user or address address body field.
    * @apiParam {String} [last_name] contact last_name.
    * @apiParam {String} [first_name] contact first_name.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.post('/api/public/v1/contacts/edit', (req, res) => {
        req.checkBody({
            'contact': {
                notEmpty: true,
                errorMessage: 'contact couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.editContact(decoded, req.body, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {POST} /api/public/v1/contacts/remove Remove user from contacts list
    * @apiName Remove from contacts
    * @apiGroup Contacts
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} contact User login or custom address ID, which need to remove.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.post('/api/public/v1/contacts/remove', (req, res) => {
        req.checkQuery({
            'contact': {
                notEmpty: true,
                errorMessage: 'contact couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            contactsServices.removeContact(decoded, req.query.contact, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/messages/get/inbox Get list of inbox messages
    * @apiName Get inbox messages list
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} [page] This param init page of data (Default is 1).
    * @apiParam {String} [count] This param filtered data of counts per request. Number beetween 1 and 30 (Default is 30)
    * @apiParam {String} [fields] Field for response filtering (Default all fields).
    * @apiParam {String} [category] For filtering response by categories, all will be sended on empty.
    *
    * @apiSuccess {String} messagesCount Count of messages in this response.
    * @apiSuccess {String} page Number of loaded page.
    * @apiSuccess {Array} messages List of messages.
    * @apiSuccess {Array} totalCount Total count of messages for thi user.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/messages/get/inbox', (req, res) => {
        req.checkQuery({
            'page': {
                optional: true
            },
            'count': {
                optional: true
            },
            'fields': {
                optional: true
            },
            'category': {
                optional: true
            }
        });

        if (req.query.count && (req.query.count < 1 || req.query.count > 30)) {
            return res.status(400).json({message: '"count" number maybe only between 1 and 30. Default is 10'});
        }

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        messagesServices.getListOfMessages(
            decoded,
            Number(req.query.count),
            Number(req.query.page),
            req.query.fields,
            req.query.category,
            'inbox',
            (response, status) => {
                return res.status(status || 200).json(response);
            }
        );
    })

    /**
    * @api {GET} /api/public/v1/messages/get/outbox Get list of outbox messages
    * @apiName Get outbox messages list
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} [page] This param init page of data (Default is 1).
    * @apiParam {String} [count] This param filtered data of counts per request. Number beetween 1 and 30 (Default is 30)
    * @apiParam {String} [fields] Field for response filtering (Default all fields).
    * @apiParam {String} [category] For filtering response by categories, all will be sended on empty.
    *
    * @apiSuccess {String} messagesCount Count of messages in this response.
    * @apiSuccess {String} page Number of loaded page.
    * @apiSuccess {Array} messages List of messages.
    * @apiSuccess {Array} totalCount Total count of messages for thi user.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/messages/get/outbox', (req, res) => {
        req.checkQuery({
            'page': {
                optional: true
            },
            'count': {
                optional: true
            },
            'fields': {
                optional: true
            },
            'category': {
                optional: true
            }
        });

        if (req.query.count && (req.query.count < 1 || req.query.count > 30)) {
            return res.status(400).json({message: '"count" number maybe only between 1 and 30. Default is 10'});
        }

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        messagesServices.getListOfMessages(decoded, Number(req.query.count), Number(req.query.page), req.query.fields, req.query.category, 'outbox', (response, status) => {
            res.status(status || 200).json(response);
        });
    })

    /**
    * @api {GET} /api/public/v1/messages/get/trash Get list of trash messages
    * @apiName Get trash messages list
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} [page] This param init page of data (Default is 1).
    * @apiParam {String} [count] This param filtered data of counts per request. Number beetween 1 and 30 (Default is 30)
    * @apiParam {String} [fields] Field for response filtering (Default all fields).
    *
    * @apiSuccess {String} messagesCount Count of messages in this response.
    * @apiSuccess {String} page Number of loaded page.
    * @apiSuccess {Array} messages List of messages.
    * @apiSuccess {Array} totalCount Total count of messages for thi user.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/messages/get/trash', (req, res) => {
        req.checkQuery({
            'page': {
                optional: true
            },
            'count': {
                optional: true
            },
            'fields': {
                optional: true
            }
        });

        if (req.query.count && (req.query.count < 1 || req.query.count > 30)) {
            return res.status(400).json({message: '"count" number maybe only between 1 and 30. Default is 10'});
        }

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        messagesServices.getListOfMessages(decoded, Number(req.query.count), Number(req.query.page), req.query.fields, req.query.category, 'trash', (response, status) => {
            res.status(status || 200).json(response);
        });
    })

    /**
    * @api {GET} /api/public/v1/messages/download/:filename Download attachment file
    * @apiName Download file
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    */
    app.get('/api/public/v1/messages/download/:filename', (req, res) => {
        if (!req.params.filename) {
            return res.status(400).json({message: 'Param "filename" couldn\'t be empty'});
        }

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        messagesServices.downloadFile(decoded, req.params.filename, (directory, root, status) => {
            res.status(status || 200).sendFile(directory, root);
        });
    })

    /**
    * @api {DELETE} /api/public/v1/messages/remove/inbox Add inbox message to trash
    * @apiName Inbox message to trash
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} id ID of deleted message.
    *
    * @apiSuccess {Array} messages Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.delete('/api/public/v1/messages/remove/inbox', (req, res) => {
        req.checkQuery({
            'id': {
                notEmpty: true,
                errorMessage: '"id" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            messagesServices.addToTrash(decoded, req.query.id, 'inbox', (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {DELETE} /api/public/v1/messages/remove/outbox Add outbox message to trash
    * @apiName Outbox message to trash
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} id ID of deleted message.
    *
    * @apiSuccess {Array} messages Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.delete('/api/public/v1/messages/remove/outbox', (req, res) => {
        req.checkQuery({
            'id': {
                notEmpty: true,
                errorMessage: '"id" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            messagesServices.addToTrash(decoded, req.query.id, 'outbox', (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {DELETE} /api/public/v1/messages/remove/trash Clean trash
    * @apiName Clean trash
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} id ID of deleted message.
    *
    * @apiSuccess {String} messages Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.delete('/api/public/v1/messages/remove/trash', (req, res) => {
        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        messagesServices.cleanTrash(decoded, (response, status) => {
            res.status(status || 200).json(response);
        });
    })

    /**
    * @api {DELETE} /api/public/v1/message/remove/trash/message Remove one message from trash
    * @apiName Remove one message from trash
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} id ID of deleted message.
    *
    * @apiSuccess {String} messages Success message.
    * @apiSuccess {Number} code Seccess code.
    */
    app.delete('/api/public/v1/message/remove/trash/message', (req, res) => {
        req.checkQuery({
            'id': {
                notEmpty: true,
                errorMessage: '"id" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            messagesServices.removeOneMessageFromTrash(decoded, req.query.id, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {PUT} /api/public/v1/messages/create Create new message
    * @apiName New Message
    * @apiGroup Messages
    * @apiDescription Use body for requests on this method. Attachment is optional field.
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} sender Sender login (current user login).
    * @apiParam {String} recipient Recipients of this message. (Semicolon separated, available login scheme: LOGIN~post.com).
    * @apiParam {String} subject Subject of this message.
    * @apiParam {String} type Message type maybe only "email" or "post-email".
    * @apiParam {String} [text] Text of this message.
    * @apiParam {String} [category] For filtering message by category (Default is "general" category).
    * @apiParam {String} [html] HTML code of this message.
    * @apiParam {File} [filename] Attachment files, no more than 5 files.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    * @apiSuccess {String} messageID ID of created message.
    */
    app.put('/api/public/v1/messages/create', upload.array('filename', 5), (req, res) => {
        req.checkBody({
            'sender': {
                notEmpty: true,
                errorMessage: '"sender" body field couldn\'t be empty'
            },
            'recipient': {
                notEmpty: true,
                errorMessage: '"recipient" body field couldn\'t be empty'
            },
            'subject': {
                notEmpty: true,
                errorMessage: '"subject" body field couldn\'t be empty'
            },
            'type': {
                notEmpty: true,
                errorMessage: '"type" body field couldn\'t be empty'
            },
            'text': {
                optional: true
            },
            'html': {
                optional: true
            },
            'category': {
                optional: true
            }
        });

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else if (req.body.type == 'email' || req.body.type == 'post-email') {
            messagesServices.createMessage(decoded, req.body, req.files, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
        else if (req.body.type != 'email' || req.body.type != 'post-email') {
            return res.status(400).json({message: 'Message type maybe only "email" or "post-email"', code: 40000});
        }
    })

    /**
    * @api {GET} /api/public/v1/messages/get/id Get message by ID with generated PDF from HTML
    * @apiName Message by ID
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    * @apiParam {String} id Message ID.
    *
    * @apiSuccess {String} message Raw message with link to PDF.
    * @apiSuccess {Number} code Seccess code.
    */
    app.get('/api/public/v1/messages/get/id', (req, res) => {
        req.checkQuery({
            'id': {
                notEmpty: true,
                errorMessage: '"id" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            messagesServices.findMessageById(decoded, req.query.id, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {GET} /api/public/v1/messages/pdf/:filename Download message PDF
    * @apiName Download message PDF
    * @apiGroup Messages
    *
    * @apiHeader {String} x-api-auth Token.
    */
    app.get('/api/public/v1/messages/pdf/:filename', (req, res) => {
        if (!req.params.filename) {
            return res.status(400).json({message: 'Param "filename" couldn\'t be empty'});
        }

        var dir = fs.readdirSync('./pdf_messages');

        if (dir.indexOf(req.params.filename) < 0) {
            return res.status(400).json({message: req.params.filename + ' not found, please get new download link', code: 40000});
        } else {
            return res.status(200).sendFile(req.params.filename, {root: './pdf_messages'});
        }
    })

    /**
    * @api {GET} /api/public/v1/user/info Get user info
    * @apiName User info
    * @apiGroup User
    *
    * @apiHeader {String} x-api-auth Token.
    *
    * @apiSuccess {Number} code Seccess code.
    * @apiSuccess {Object} data User information.
    */
    app.get('/api/public/v1/user/info', (req, res) => {
        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        userService.getUserInfo(decoded, (response, status) => {
            res.status(status || 200).json(response);
        });
    })

    /**
    * @api {POST} /api/public/v1/user/update Update user info
    * @apiName Update user
    * @apiGroup User
    * @apiDescription Use body for requests on this method. Below list of user info params which can be changed
    *
    * @apiHeader {String} x-api-auth Token.
    *
    * @apiParam {String} [first_name] User firstname.
    * @apiParam {String} [last_name] User lastname.
    * @apiParam {Array} [addresses] User address.
    * @apiParam {String} [phone_number] Phone number with region code and without plus symbol.
    * @apiParam {File} [image] User avatar (if you need remove a photo enter - null).
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {Number} code Seccess code.
    * @apiSuccess {Object} data User information.
    */
    app.post('/api/public/v1/user/update', upload.single('image'), (req, res) => {
        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        if (req.file) {
            var type = req.file.originalname.split('.').pop();
            var name = decoded.user + '-' + new Date().getTime() + '.' + type;
            var buffer = fs.readFileSync(req.file.destination + req.file.filename);

            var filename = path.join(process.env.TEMP_DIR, name);

            fs.writeFile(filename, buffer, (err) => {})
            req.body.image = '/api/public/v1/static/images/' + name;

            fs.unlink(req.file.destination + req.file.filename, (err) => { if (err) throw err; });
        }
        else if (!req.body.image) {
            delete req.body.image;
        }

        userService.updateUserInfo(decoded, req.body, (response, status) => {
            res.status(status || 200).json(response)
        });
    })

    /**
    * @api {POST} /api/public/v1/user/support Create support request
    * @apiName Support request
    * @apiGroup User
    *
    * @apiHeader {String} x-api-auth Token.
    *
    * @apiParam {String} [login] Tilda login.
    * @apiParam {String} contact_email Contact email.
    * @apiParam {String} message Message.
    *
    * @apiSuccess {String} message Success message.
    * @apiSuccess {String} requestId request ID.
    * @apiSuccess {Number} code Seccess code.
    */
    app.post('/api/public/v1/user/support', (req, res) => {
        req.checkBody({
            'contact_email': {
                notEmpty: true,
                errorMessage: '"contact_email" body field couldn\'t be empty' // Error message for the parameter
            },
            'message': {
                notEmpty: true,
                errorMessage: '"message" body field couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            supportService.createSupportMessage(req.body, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    /**
    * @api {DELETE} /api/public/v1/user/remove/image Remove user image
    * @apiName Remove user image
    * @apiGroup User
    * @apiDescription This method remove user image and return null as image in the future
    *
    * @apiHeader {String} x-api-auth Token.
    *
    * @apiSuccess {Object} data User info
    * @apiSuccess {Number} code Success code.
    */
    app.delete('/api/public/v1/user/remove/image', (req, res) => {
        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        userService.removeUserImage(decoded, (response, status) => {
            res.status(status || 200).json(response)
        })
    })

    /**
    * @api {GET} /api/public/v1/billing/price Get price of sending
    * @apiName Price
    * @apiGroup Billing
    * @apiDescription This method return price of service using
    *
    * @apiParam {String} type Message type (email or post-email).
    * @apiHeader {String} x-api-auth Token.
    *
    * @apiSuccess {String} message Readable price message.
    * @apiSuccess {Number} value Price value.
    * @apiSuccess {String} currency Currency.
    */
    app.get('/api/public/v1/billing/price', (req, res) => {
        req.checkQuery({
            'type': {
                notEmpty: true,
                errorMessage: '"type" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var token = req.headers['x-api-auth'];
        var decoded = jwt.verify(token, global.JWT);

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            let data = new Object();
            if (req.query.type == "email") {
                data.message = '0 euro';
                data.value = 0;
            }
            else if (req.query.type == "post-email") {
                data.message = '2 euro';
                data.value = 2;
            }
            else {
                return res.status(400).json({message: 'Undefined message type. ' + req.query.type, availableTypes: [
                    'email',
                    'post-email'
                ], code: 40000});
            }

            data.currency = 'eur';
            res.json(data);
        }
    })

    // THIS API ONLY FOR CALLBACK FROM PAYMENT SYSTEM
    app.post('/api/public/v1/billing/update', (req, res) => {
        billingServices.updateUserBilling(req.body);
        res.status(200).json({message: 'ok'});
    })

    /**
    * @api {GET} /api/public/v1/billing/get Get user billing history
    * @apiName Billing history
    * @apiGroup Billing
    *
    * @apiParam {String} page billing history page.
    * @apiParam {String} count count of elements in response array.
    *
    * @apiHeader {String} x-api-auth Token.
    *
    * @apiSuccess {Number} code Success code.
    * @apiSuccess {Object} data User billing history and current balance.
    */
    app.get('/api/public/v1/billing/get', (req, res) => {
        req.checkQuery({
            'page': {
                notEmpty: false,
                errorMessage: '"page" parameter couldn\'t be empty' // Error message for the parameter
            },
            'count': {
                notEmpty: false,
                errorMessage: '"count" parameter couldn\'t be empty'
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            var token = req.headers['x-api-auth'];
            var decoded = jwt.verify(token, global.JWT);

            billingServices.getUserBillingInfo(decoded, req.query, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })


    // ** INTERNAL API **
    app.get('/api/internal/v1/printer/generate/token', (req, res) => {
        req.checkQuery({
            'printerName': {
                notEmpty: false,
                errorMessage: '"printerName" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            intervalServices.generateToken(req.query.printerName, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    app.get('/api/internal/v1/printer/auth', (req, res) => {
        req.checkQuery({
            'token': {
                notEmpty: false,
                errorMessage: '"token" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            intervalServices.authenticate(req.query.token, (response, status) => {
                res.status(status || 200).json(response);
            });
        }
    })

    app.get('/api/internal/v1/printer/messages', (req, res) => {
        req.checkQuery({
            'token': {
                notEmpty: false,
                errorMessage: '"token" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else {
            intervalServices.authenticate(req.query.token, (response, status) => {
                if (response.code !== 20000) {
                    return res.status(status || 200).json(response);
                }
                else {
                    intervalServices.getUnprintedMessages(req.query.token, (response, status) => {
                        return res.status(status || 200).json(response);
                    });
                }
            });
        }
    })

    app.post('/api/internal/v1/printer/update/status', (req, res) => {
        req.checkQuery({
            'token': {
                notEmpty: false,
                errorMessage: '"token" parameter couldn\'t be empty' // Error message for the parameter
            },
            'status': {
                notEmpty: false,
                errorMessage: '"status" parameter couldn\'t be empty (NOT_PRINTED, PRINTING, PRINTED)' // Error message for the parameter
            },
            'id': {
                notEmpty: false,
                errorMessage: '"id" parameter couldn\'t be empty' // Error message for the parameter
            }
        });

        var errors = req.validationErrors();
        if (errors) { return res.status(400).json(errors); }
        else if (req.query.status != 'NOT_PRINTED' && req.query.status != 'PRINTING' && req.query.status != 'PRINTED') {
            return res.status(400).json({message: "Status query can have only on of this statuses: NOT_PRINTED, PRINTING, PRINTED", code: 40000});
        }
        else {
            intervalServices.authenticate(req.query.token, (response, status) => {
                if (response.code !== 20000) {
                    return res.status(status || 200).json(response);
                }
                else {
                    intervalServices.updatePrintStatus(req.query, (response, status) => {
                        return res.status(status || 200).json(response);
                    });
                }
            });
        }
    })



    return app.listen(PORT, function () { console.log('API listening on port ' + PORT + '!'); });
}
