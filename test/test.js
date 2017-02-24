const assert = require('assert');
const expect = require('chai').expect;
const should = require('chai').should;

// Import services
const auth_services = require('../modules/api/services/auth.js');
const user_services = require('../modules/api/services/user.js');
const messages_services = require('../modules/api/services/messages.js');
const contacts_services = require('../modules/api/services/contacts.js');
const support_service = require('../modules/api/services/support.js');

const MONGODB_URI = 'mongodb://root:882Bee0xeF@waffle.modulusmongo.net:27017/ibaq2ugI'; // modulus

const MongoClient = require('mongodb').MongoClient;
let connection = new Object();

const user1 = Math.floor(Math.random() * (99999999 - 10000000)) + 10000000;
const user2 = Math.floor(Math.random() * (99999999 - 10000000)) + 10000000;
const user3 = Math.floor(Math.random() * (99999999 - 10000000)) + 10000000;
global.addr;


// REVIEW: please, drop users collection before testing and add default user with 'test' login name
// 'foo' login uses for not exists users
// **********
describe('connection', function (done) {
    // Create connection to DB for enter this connection in function in the future
    this.timeout(10000);

    describe('Connection to MongoDB', function() {
        this.timeout(15000);
        it('return successfull connection', (done) => {
            setTimeout(() => {
                MongoClient.connect(MONGODB_URI, (err, db) => {
                    connection = db;
                    done();
                });
            }, 10000)
        })
    })

    describe('addUser', function () {
        this.timeout(10000);
        var data = {
            "last_name": "test",
            "first_name": "test",
            "login": user1.toString(),
            "password": "123456",
            "birthday": "01.01.1970",
            "addresses": [
                {
                    "post_code": "test",
                    "country": "test",
                    "city": "test",
                    "address": "test"
                }
            ],
            "phone_number": "79645103007"
        };

        it('return that user created sucessful', (done) => {
            auth_services.addUser(data, (res) => {
                expect(res.code).to.equal(20000);
                done();
            }, connection)
        })
        it('return exception if user is undefined', (done) => {
            auth_services.addUser(undefined, (res) => {
                expect(res.code).to.equal(40000);
                done();
            }, connection)
        })
        it('return error if user is already exist', (done) => {
            auth_services.addUser(data, (res) => {
                expect(res.code).to.equal(40009);
                done();
            }, connection)
        })
    })

    describe('checkLoginAvailable', function () {
        it('return that login is available', (done) => {
            let login = user2; // this login was available then test wrote
            auth_services.checkLoginAvailable(login, (res) => {
                expect(res.message).to.equal(login + ' is available');
                expect(res.code).to.equal(20000);
                done();
            }, connection);
        })
        it('return that login is unavailable', (done) => {
            let login = user1; // this login was unavailable then test wrote
            auth_services.checkLoginAvailable(login, (res) => {
                expect(res.message).to.equal(login + ' is unavailable');
                expect(res.code).to.equal(40009);
                done();
            }, connection);
        })
    })

    describe('authenticate', function () {
        // this.timeout(10000);
        it('return that user have unverified phone', (done) => {
            auth_services.authenticate({login: user1.toString(), password: '123456'}, (res) => {
                expect(res.code).to.equal(40001);
                done();
            }, connection)
        })
        it('verify user phone', (done) => {
            let col = connection.collection('users');
            let test = (data) => {
                expect(data.code).to.equal(20000);
                done();
            }

            return col.find({login: user1.toString()}).limit(1).next((err, doc) => {
                auth_services.codeVerify({phone: doc.phone_number, code: doc.one_time_code.toString()}, (res) => {
                    test(res);
                }, connection)
            })
        })
        it('return token if user is authenticated', (done) => {
            auth_services.authenticate({login: user1.toString(), password: '123456'}, (res) => {
                expect(res).to.have.property('token');
                done();
            }, connection)
        })
        it('authenticate user with uppercase login', (done) => {
            auth_services.authenticate({login: (user1.toString()).toUpperCase(), password: '123456'}, (res) => {
                expect(res.code).to.equal(20000);
                done();
            }, connection)
        })
        it('return exception if user is not exist', (done) => {
            auth_services.authenticate({login: user2}, (res) => {
                expect(res.code).to.equal(40001);
                done();
            }, connection)
        })
        it('return exception if password is incorrect', (done) => {
            auth_services.authenticate({login: user1, password: 'qwerty'}, (res) => {
                expect(res.code).to.equal(40001);
                done();
            }, connection)
        })
    })

    describe('changePassword', function () {
        this.timeout(30000);
        it('return exception if user is not exist', (done) => {
            auth_services.changePassword({user: user2}, {password: '123456'}, (res) => {
                expect(res.code).to.equal(40000);
                done();
            }, connection)
        })
        it('return success', (done) => {
            let password = '123456';
            auth_services.changePassword({user: user1}, {password: '123456'}, (res) => {
                expect(res.code).to.equal(20000);
                done();
            }, connection)
        })
    })

    describe('getUserInfo', function () {
        it('return error message if user it not exist', (done) => {
            user_services.getUserInfo({user: user2}, (res) => {
                expect(res.data).to.be.empty;
                expect(res.code).to.equal(40000);
                done();
            }, connection)
        })
        it('return user info', (done) => {
            user_services.getUserInfo({user: user1}, (res) => {
                expect(res.data).to.be.not.empty;
                done();
            }, connection)
        })
    })

    describe('updateUserInfo', function () {
        it('update only fields which was init then user was created', (done) => {
            let fields = {
                "last_name": "Hello",
                "first_name": "world",
                "other": "some other information",
                "login": "roow",
                "addresses": [
                    {test: 'test', country: "USA"}
                ]
            }

            user_services.updateUserInfo({user: user1}, fields, (res) => {
                expect(res.data.login).to.not.equal('roow');
                expect(res.data).to.not.have.property('other');
                done();
            }, connection)
        })
        it('return exception if user is undefined', (done) => {
            user_services.updateUserInfo({user: user2}, {login: 'foo'}, (res) => {
                expect(res.code).to.be.equal(40000);
                expect(res.data).to.be.null
                done();
            }, connection)
        })
        it('return sucessfull user info update', (done) => {
            let last_name = 'Curt'
            user_services.updateUserInfo({user: user1}, {last_name: last_name}, (res) => {
                expect(res.data.last_name).to.be.equal(last_name);
                expect(res.code).to.be.equal(20000);
                done();
            }, connection)
        })
    })

    describe('createMessage', function () {
        it('create message successfull', (done) => {
            let sender = user1.toString();
            let recipient = user1.toString().toUpperCase() + '~post.com;' +  user1.toString() + '~post.com:home;' + user1.toString() + '~post.com:work;' + user1.toString() + '~post.com:FIRST_NAME LAST_NAME, POST_CODE, COUNTRY, CITY, ADDRESS;FIRST_NAME LAST_NAME, POST_CODE, COUNTRY, CITY, ADDRESS'
            let message = { sender: sender, recipient: recipient, subject: 'Test', text: 'Hello world' };

            messages_services.createMessage({user: user1}, message, null, (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            });
        })
        it('return exception if recipient is not defined in Tilda System', (done) => {
            let sender = user1.toString();
            let recipient = user2.toString() + '~post.com';
            let message = { sender: sender, recipient: recipient, subject: 'Test', text: 'Hello world' };

            messages_services.createMessage({user: sender}, message, null, (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            });
        })
    })

    describe('getListOfMessages', function () {
        it('return exception if storage key is undefined', (done) => {
            messages_services.getListOfMessages({user: user1}, null, null, null, 'general', undefined, (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            }, connection)
        })
        it('return 1 message from outbox', (done) => {
            messages_services.getListOfMessages({user: user1}, 1, 1, null, null, 'outbox', (res) => {
                expect(res.code).to.be.equal(20000);
                expect(res.messages).to.have.length(1);
                done();
            }, connection)
        })
        it('return only subject of message', (done) => {
            messages_services.getListOfMessages({user: user1}, 1, 1, 'subject', null, 'outbox', (res) => {
                expect(res.code).to.be.equal(20000);
                expect(res.messages[0]).to.have.property('subject');
                expect(res.messages[0]).to.not.have.property('sender');
                done();
            })
        })
    })

    describe('addToTrash', function () {
        it('return exception if not set message ID', (done) => {
            messages_services.addToTrash({user: user1}, undefined, 'inbox', (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            }, connection)
        })
        it('return exception if not set store key', (done) => {
            messages_services.addToTrash({user: user1}, 12344543, undefined, (res) => {
                expect(res.code).to.be.equal(50000);
                done();
            }, connection)
        })
        it('return sucessful message remove status', (done) => {
            let col = connection.collection('messages');
            let test = (data) => {
                expect(data.code).to.equal(20000);
                done();
            }

            return col.find({_id: user1.toString()}).limit(1).next((err, doc) => {
                messages_services.addToTrash({user: user1}, doc.inbox[0], 'inbox', (res) => {
                    test(res);
                }, connection)
            })
        })
    })

    describe('findUser', function () {
        it('return user by login', (done) => {
            contacts_services.searchUser({user: user1.toString()}, user1.toString(), (res) => {
                expect(res.data).is.an('array');
                expect(res.data).to.have.length.above(0);
                done();
            })
        })
        it('return empty array', (done) => {
            var undefinedUser = Math.floor(Math.random() * (999999999 - 100000000)) + 100000000;
            contacts_services.searchUser({user: user1.toString()}, undefinedUser.toString(), (res) => {
                expect(res.data).is.an('array');
                expect(res.data).to.be.empty;
                done();
            })
        })
    })

    describe('addContact', function (addr) {
        it('return error, because contact_login equals user login', (done) => {
            contacts_services.addContact({user: user1.toString()}, {
                post_code: '123456',
                country: 'country',
                city: 'city',
                address: 'address',
                contact_login: user1.toString()
            }, (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            })
        })
        it('return error, because contact_login is not defined in tilda system', (done) => {
            contacts_services.addContact({user: user1.toString()}, {
                post_code: '7890',
                country: 'test_country',
                city: 'test_city',
                address: 'test_address',
                contact_login: user2.toString()
            }, (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            })
        })
        it('successfully added contact', (done) => {
            contacts_services.addContact({user: user1.toString()}, {
                post_code: '7890',
                country: 'test_country',
                city: 'test_city',
                address: 'test_address',
                contact_login: 'test22'
            }, (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
        it('generate custom address', (done) => {
            contacts_services.addContact({user: user1.toString()}, {
                post_code: '0000',
                country: 'country',
                city: 'city',
                address: 'address'
            }, (res) => {
                global.addr = res.addressId;
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
    })

    describe('getContactsList', function () {
        it('return contacts list', (done) => {
            contacts_services.getContactsList({user: user1.toString()}, {page: "1", count: "5"}, (res) => {
                expect(res.code).to.be.equal(20000);
                expect(res.data).is.an('array');
                expect(res.data).to.have.length.above(0);
                done();
            })
        })
        it('return array with length equal 1', (done) => {
            contacts_services.getContactsList({user: user1.toString()}, {page: "1", count: "1"}, (res) => {
                expect(res.code).to.be.equal(20000);
                expect(res.data).is.an('array');
                expect(res.data).to.have.lengthOf(1);
                done();
            })
        })
    })

    describe('getContactById', function () {
        it('return error because user is undefined in DB', (done) => {
            contacts_services.getContactById({user: user1.toString()}, user2.toString(), (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            })
        })
        it('return user1 info', (done) => {
            contacts_services.getContactById({user: user1.toString()}, user1.toString(), (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
        it('return custom address', (done) => {
            contacts_services.getContactById({user: user1.toString()}, global.addr.toString(), (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
    })

    describe('editContact', function () {
        it('return error because user data unchangeble', (done) => {
            contacts_services.editContact({user: user1.toString()}, {contact: 'ru.test.test'}, (res) => {
                expect(res.code).to.be.equal(40000);
                done();
            })
        })
        it('update only required fields', (done) => {
            contacts_services.editContact({user: user1.toString()}, {contact: global.addr.toString(), test: 'test', post_code: '000000'}, (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
        it('return contact with changes', (done) => {
            MongoClient.connect(MONGODB_URI, (err, db) => {
                let col = db.collection('users');
                col.find({login: global.addr.toString()}).limit(1).next((err, doc) => {
                    expect(doc.post_code).to.be.equal('000000');
                    done();
                })
            })
        })
    })

    describe('removeContact', function (addr) {
        it('remove login from list', (done) => {
            contacts_services.removeContact({user: user1.toString()}, 'test22', (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
        it('remove custom address from list', (done) => {
            contacts_services.removeContact({user: user1.toString()}, global.addr.toString(), (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
        it('return empty contacts list', (done) => {
            contacts_services.getContactsList({user: user1.toString()}, {page: "1", count: "5"}, (res) => {
                expect(res.code).to.be.equal(20000);
                expect(res.data).is.an('array');
                expect(res.data).to.be.empty;
                done();
            })
        })
    })

    describe('createSupportMessage', function () {
        it('create anonym support request', (done) => {
            support_service.createSupportMessage({
                contact_email: 'mail@mail.com',
                message: 'Whis support request created from test function'
            }, (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
        it('create authorized support request', (done) => {
            support_service.createSupportMessage({
                contact_email: 'mail@mail.com',
                message: 'Whis support request created from test function',
                login: user1.toString()
            }, (res) => {
                expect(res.code).to.be.equal(20000);
                done();
            })
        })
    })

    after(function (done) {
        var _done = done;
        MongoClient.connect(MONGODB_URI, (err, db) => {
            var promises = [
                new Promise(function(resolve, reject) {
                    let col = db.collection('users');
                    col.findOneAndDelete({login: user1.toString()}, {}, (err, r) => {
                        if (err)
                            return reject();

                        return resolve();
                    })
                }),
                new Promise(function(resolve, reject) {
                    let col = db.collection('users');
                    col.findOneAndDelete({login: user3.toString()}, {}, (err, r) => {
                        if (err)
                            return reject();

                        return resolve();
                    })
                }),
                new Promise(function(resolve, reject) {
                    let col = db.collection('contacts');
                    col.findOneAndDelete({_id: user1.toString()}, {}, (err, r) => {
                        if (err)
                            return reject();

                        return resolve();
                    })
                }),
                new Promise(function(resolve, reject) {
                    let col = db.collection('messages');
                    col.findOneAndDelete({_id: user1.toString()}, {}, (err, r) => {
                        if (err)
                            return reject();

                        return resolve();
                    })
                }),
                new Promise(function(resolve, reject) {
                    let col = db.collection('bills');
                    col.findOneAndDelete({_id: user1.toString()}, {}, (err, r) => {
                        if (err)
                            return reject();

                        return resolve();
                    })
                }),
                new Promise(function(resolve, reject) {
                    let col = db.collection('raw_messages');
                    col.deleteMany({sender: user1.toString()}, {}, (err, r) => {
                        if (err)
                            return reject();

                        return resolve();
                    })
                })
            ]

            Promise.all(promises).then(() => {
                console.log('All records removed successfull');
                _done();
            })
        });
    })
});
