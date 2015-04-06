var io = require('socket.io-client');
var crypto = require('crypto');
var async = require('async');
var log = require('./log');
var child_process = require('child_process');
var ss = require('socket.io-stream');
var path = require('path');
var fs = require('fs');

var resource_dir = "/resource";
var test_script_path =path.join(__dirname, "/judge_script.py");
var data_root = '/usr/share/oj4th';


function judge_client(data, callback) {
    this.name = data.name;
    this.id = data.id;
    this.tmpfs_size = data.tmpfs_size || 500;
    this.cpu_mask = 0;
    var self = this;
    data.cpu.forEach(function (ele) {
        self.cpu_mask += (1 << ele);
    });
    this.task = undefined;
    this.secret_key = data.secret_key;
    this.create_time = data.create_time;
    this.log = new log(data.log_path);
    this.config = JSON.stringify(data);
    this.status = undefined;
    this.url = data.url;
    this.socket = undefined;



    /**
     * emit status event when changed status
     * @param status {string} self.status changed to
     * @param message {string} which will be logged
     */
    this.change_status = function (status, message) {
        self.status = status;
        self.socket.emit('status', self.status, function () {
            self.log.write(message);
        });
    };
    /**
     * mount and clean_all
     * @param callback {Function} called after started
     */
    this.start = function (callback) {
        child_process
            .spawn('python', ['./judge.py', 'mount', self.id, self.tmpfs_size, self.cpu_mask], {stdio:'inherit'})
            .on('exit', function (code){
                if(code != 0) {
                    console.log('mount failed');
                    self.log.write('mount failed');
                    return ;
                }
                self.change_status("ready", "mounted");
                callback && callback();
            });
    };

    /**
     * init the judge
     * @param callback {Function} called after inited
     */
    this.init = function (callback) {

        self.socket = io.connect(self.url)
            .on('connect', function () {
                self.log.write('connected with ' + self.config);
                self.log_in(function () {
                    console.log('login');
                });
            })
            .on('message', function (msg) {
                self.log.write('Receive a piece of message: ' + msg);
            })
            .on('disconnect', function () {
                self.log.write('Disconnected');
            })
            .on('connect_error', function (err) {
                self.log.write('Error! err.message = ' + err.message);
            })
            .on('connect_timeout', function () {
                self.log.write('Connection timeout');
            })
            .on('reconnect', function (num) {
                self.log.write('Reconnect with number:' + num);
            })
            .on('reconnect_attempt', function () {
                self.log.write('Trying reconnect');
            })
            .on('task', function (task, confirm) {
                self.task = task;
                confirm(); //confirm that it got the task
                self.log.write('Got a task:' + JSON.stringify(self.task));
                self.work(function (err) {
                    if(err) {
                        self.log.write(err.message);
                    }
                });

            })
            .on('command', function (command, callback) {
                self.log.write('Receive command');
                self.command(command, callback);
            });
        //noinspection JSUnresolvedVariable
        process.on('SIGTERM', function () {
            if (self.socket === undefined) return;
            self.stop(function (err) {
                if(err) {
                    console.log(err.message);
                    self.log.write(err.message);
                }
                //noinspection JSUnresolvedVariable
                process.disconnect && process.disconnect();
            });
        });
        self.start(callback);
    };
    /**
     * server can command client
     * @param command {String} the command from server
     * @param callback {Function}
     */
    this.command = function (command, callback) {
        switch (command) {
            case 'stop': self.stop(callback);break;
            case 'restart': self.stop(self.start(callback));break;
            default:console.log(command);
        }
    };

    /**
     * stop the process
     * @param callback {Function}
     */

    this.stop = function (callback) {
        async.parallel(
        [   function (callback) {
                if(self.status == 'ready') {
                    callback && callback();
                } else {
                    self.fail(callback); // If it has the task not complete
                }
            },
            function (callback) {
                child_process
                    .spawn('python', ['./judge.py', 'umount', self.id, self.tmpfs_size, self.cpu_mask], {stdio:'inherit'})
                    .on('exit', function (code) {
                        if(code != 0) {
                            console.log('umount failed');
                            self.log.write('umount failed');
                            return ;
                        }
                        callback && callback();
                    });
            }
        ], callback
        );
    };

    /**
     * report the failure
     * @param callback {Function}
     */

    this.fail = function (callback) {
        console.log('failed');
        self.log.write('failed');
        self.socket.emit('fail', self.task, callback);
    };
    /**
     * login when socket got connect
     * @param callback {Function}
     */
    this.log_in = function (callback) {
        var post_time = new Date().toISOString();
        self.socket.emit('login', {
            name: self.name,
            post_time: post_time,
            token: crypto.createHash('sha1').update(self.secret_key + '$' + post_time).digest('hex'),
            status: self.status
        }, function (err) {
            if (err) {
                self.log.write(err.message);
                return;
            }
            self.log.write('Logged in');
            callback && callback();
        });
    };

    /**
     * prepare environment for judging
     * @param callback {Function}
     */

    this.pre_env = function (callback) {
        child_process
            .spawn('python', ['./judge.py', 'clean_all', self.id, self.tmpfs_size, self.cpu_mask], {stdio:'inherit'})
            .on('exit', function (code) {
                if(code != 0) {
                    console.log('clean_all failed');
                    self.log.write('clean_all failed');
                    return ;
                }
                callback && callback();
            }); //Please check the exit-code
    };
    /**
     * extract_file extract file from file_path to judge_res
     * @param file_path {String} path to the file
     * @param callback {Function}
     */
    this.extract_file = function (file_path, callback) {
        child_process
            .spawn('python', ['./judge.py', 'resource', self.id, self.tmpfs_size, self.cpu_mask, file_path], {stdio:'inherit'})
            .on('exit', function (code) {
                if(code != 0) {
                    console.log('resource failed');
                    self.log.write('getting resource failed');
                    return ;
                }
                callback && callback();
            }); //Please check the exit-code
    };
    /**
     * prepare files for judging
     * @param callback {Function}
     */
    this.pre_file = function (callback) {
        var file_path;
        file_path = path.join(__dirname, resource_dir, self.task.filename);
        fs.exists(file_path, function (exists) {
            if (exists) {
                self.extract_file(file_path, callback);
            } else {
                var stream = ss.createStream();
                ss(self.socket).emit('file', stream, self.task.filename);
                stream.pipe(fs.createWriteStream(file_path))
                    .on('finish', function () {
                        self.extract_file(file_path, callback);
                    })
                    .on('error', function (err) {
                        ss(self.socket).emit('file', stream, self.task.filename); /// resent the request
                        console.log('trans error');
                        self.log.write(err.message);
                    });
            }
        });
    };

    /**
     * prepare submission and test_setting
     * @param callback {Function}
     */
    this.pre_submission = function (callback) {
        // test_setting should be right format
        self.task.source_code = self.task.source_code || '';
        self.task.source_lang = self.task.source_lang || '';
        self.task.test_setting = self.task.test_setting || {};

        var test_setting;
        test_setting = '';
        for(var i in self.task.test_setting)
            if(self.task.test_setting.hasOwnProperty(i))
                test_setting = test_setting + i + '=' + self.task.test_setting[i].join(',') + '\n';

        self.task.test_setting = test_setting;

        child_process
            .spawn('python', ['./judge.py', 'prepare', self.id, self.tmpfs_size, self.cpu_mask, self.task.source_code, self.task.source_lang, self.task.test_setting, test_script_path], {stdio:'inherit'})
            .on('exit', function (code) {
                if(code != 0) {
                    console.log('prepare failed');
                    self.log.write('prepare failed');
                    return ;
                }
                callback && callback();
            });
    };

    /**
     * prepare for juding
     * @param callback {Function}
     */

    this.prepare = function (callback) {
        self.change_status('preparing','Preparing.');
        async.parallel([
            self.pre_env,
            self.pre_submission,
            self.pre_file
        ], callback);
    };

    /**
     * when everything is ready, it will start judging
     * @param callback {Function}
     */

    this.judge = function (callback) {
        self.change_status('judging', 'Judging.');
        child_process
            .spawn('python', ['./judge.py', 'judge', self.id, self.tmpfs_size, self.cpu_mask], {stdio:'inherit'})
            .on('exit', function (code) {
                if(code != 0) {
                    console.log('judge failed');
                    self.log.write('judge failed');
                    return ;
                }
                callback && callback();
            });
    };
    /**
     * report task when finished it
     * @param callback {Function}
     */
    this.report = function (callback) {
        self.change_status('reporting', 'Reporting');
        fs.readFile(path.join(data_root,'work_'+self.id,'__report__'), function (err, data) {
            self.task.report = data.toString();
            console.log(self.task.report);
            self.socket.emit('report', self.task, function () {
                self.change_status('ready', 'Finished with ' + JSON.stringify(self.task) + ' and ready now.');
                callback && callback();
            });
        });
    };

    /**
     * main work to the self.task
     * @param callback {Function}
     */

    this.work = function (callback) {
        async.series([
                self.prepare,
                self.judge,
                self.report
            ],
            callback
        );
    };

    callback && callback();
}


module.exports = judge_client;




