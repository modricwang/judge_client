// Generated by CoffeeScript 1.9.3
(function() {
  var FILE_PAGE, NoTask, Promise, REPORT_PAGE, TASK_PAGE, URL, child_process, child_process_promised, crypto, data_dirname, fs, judge_client, log, path, resource_dirname, rp, submission_dirname, utils_dirname, work_dirname,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  crypto = require('crypto');

  log = require('./log');

  path = require('path');

  Promise = require('bluebird');

  rp = require('request-promise');

  URL = require('url');

  fs = Promise.promisifyAll(require('fs'), {
    suffix: 'Promised'
  });

  child_process = require('child-process-promise');

  child_process_promised = Promise.promisifyAll(require('child_process'), {
    suffix: 'Promised'
  });

  resource_dirname = "resource";

  data_dirname = "data";

  work_dirname = "work";

  submission_dirname = "submission";

  utils_dirname = "utils";

  TASK_PAGE = '/judge/task';

  FILE_PAGE = '/judge/file';

  REPORT_PAGE = '/judge/report';

  NoTask = (function(superClass) {
    extend(NoTask, superClass);

    function NoTask(message) {
      this.message = message != null ? message : "No task to judge.";
      this.name = 'NoTask';
      Error.captureStackTrace(this, NoTask);
    }

    return NoTask;

  })(Error);

  judge_client = (function() {
    var promiseWhile, self;

    self = void 0;

    promiseWhile = function(action) {
      var my_loop, resolver;
      resolver = Promise.defer();
      my_loop = function() {
        if (self.isStopped) {
          return resolver.resolve();
        }
        return Promise.cast(action()).then(my_loop)["catch"](resolver.reject);
      };
      process.nextTick(my_loop);
      return resolver.promise;
    };

    function judge_client(data) {
      this.name = data.name;
      this.id = data.id;
      this.cpu_set = data.cpu_set;
      this.memory_limit = data.memory_limit;
      this.task = void 0;
      this.secret_key = data.secret_key;
      this.create_time = data.create_time;
      this.log = new log(data.log_path);
      this.config = JSON.stringify(data);
      this.status = void 0;
      this.host = data.host;
      this.isStopped = false;
      self = this;
    }

    judge_client.prototype.send = function(url, form) {
      var post_time;
      if (form == null) {
        form = {};
      }
      post_time = new Date().toISOString();
      form.judge = {
        id: self.id,
        name: self.name,
        post_time: post_time,
        token: crypto.createHash('sha1').update(self.secret_key + '$' + post_time).digest('hex')
      };
      return rp.post(URL.resolve(self.host, url), {
        json: form
      });
    };

    judge_client.prototype.getTask = function() {
      return self.send(TASK_PAGE);
    };

    judge_client.prototype.pre_submission = function() {
      var data, i, inputFiles, outputFiles, test_setting, weights, work_path;
      test_setting = "";
      for (i in self.task.manifest.test_setting) {
        if (self.task.manifest.test_setting[i] instanceof Array) {
          test_setting += i + " = " + (self.task.manifest.test_setting[i].join(',')) + "\n";
        } else {
          test_setting += i + " = " + self.task.manifest.test_setting[i] + "\n";
        }
      }
      inputFiles = (function() {
        var j, len, ref, results;
        ref = self.task.manifest.data;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          data = ref[j];
          results.push(data.input);
        }
        return results;
      })();
      outputFiles = (function() {
        var j, len, ref, results;
        ref = self.task.manifest.data;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          data = ref[j];
          results.push(data.output);
        }
        return results;
      })();
      weights = (function() {
        var j, len, ref, results;
        ref = self.task.manifest.data;
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          data = ref[j];
          results.push(data.weight);
        }
        return results;
      })();
      test_setting += "standard_input_files = " + (inputFiles.join(',')) + "\n";
      test_setting += "standard_output_files = " + (outputFiles.join(',')) + "\n";
      test_setting += "round_weight = " + (weights.join(',')) + "\n";
      test_setting += "test_round_count = " + self.task.manifest.data.length + "\n";
      work_path = path.resolve(__dirname, work_dirname, self.name);
      return Promise.all([fs.writeFilePromised(path.resolve(work_path, submission_dirname, '__main__'), self.task.submission_code.content), fs.writeFilePromised(path.resolve(work_path, submission_dirname, '__lang__'), self.task.lang), fs.writeFilePromised(path.resolve(work_path, data_dirname, '__setting_code__'), test_setting)]).then(function() {
        return console.log("Pre_submission finished");
      });
    };

    judge_client.prototype.get_file = function(file_path) {
      return self.send(FILE_PAGE, {
        problem_id: self.task.problem_id,
        filename: self.task.manifest.test_setting.data_file
      }).pipe(fs.createWriteStream(file_path));
    };

    judge_client.prototype.pre_file = function() {
      self.file_path = path.join(__dirname, resource_dirname, self.task.manifest.test_setting.data_file);
      return Promise.resolve().then(function() {
        if (!fs.existsSync(self.file_path)) {
          return self.get_file(self.file_path);
        }
      }).then(function() {
        return console.log("Pre_file finished");
      });
    };

    judge_client.prototype.prepare = function() {
      return Promise.resolve().then(function() {
        return self.pre_submission();
      }).then(function() {
        return self.pre_file();
      }).then(function() {
        return self.task;
      });
    };

    judge_client.prototype.judge = function() {
      var file_path, utils_path, work_path;
      utils_path = path.resolve(__dirname, utils_dirname);
      work_path = path.resolve(__dirname, work_dirname, self.name);
      file_path = self.file_path;
      return child_process.spawn('python', ['./judge.py', self.id, self.memory_limit, self.cpu_set.join(','), utils_path, work_path, file_path], {
        stdio: 'inherit'
      }).then(function() {
        return self.task;
      });
    };

    judge_client.prototype.report = function() {
      var work_path;
      work_path = path.resolve(__dirname, work_dirname, self.name);
      return fs.readFilePromised(path.join(work_path, '__report__')).then(function(data) {
        var detail, dictionary, memory_cost, report, result, result_list, score, time_cost;
        detail = data.toString().split('\n');
        result_list = detail.shift().split(',');
        score = result_list[0];
        time_cost = result_list[1];
        memory_cost = result_list[2];
        result = detail.shift();
        detail = detail.join('\n');
        if (detail === '\n') {
          detail = "";
        }
        console.log(result);
        dictionary = {
          "Accepted": "AC",
          "Wrong Answer": "WA",
          "Compiler Error": "CE",
          "Runtime Error (SIGSEGV)": "REG",
          "Runtime Error (SIGKILL)": "MLE",
          "Runtime Error (SIGFPE)": "REP",
          "Presentation Error": "PE",
          "Memory Limit Exceed": "MLE",
          "Time Limit Exceed": "TLE",
          "Input File Not Ready": "IFNR",
          "Output File Not Ready": "OFNR",
          "Error File Not Ready": "EFNR",
          "Other Error": "OE"
        };
        if (dictionary[result] === void 0) {
          detail = result + "\n" + detail;
          result = "OE";
        } else {
          result = dictionary[result];
        }
        report = {
          submission_id: self.task.id,
          score: score,
          time_cost: time_cost,
          memory_cost: memory_cost,
          result: result,
          detail: detail
        };
        return self.send(REPORT_PAGE, report);
      });
    };

    judge_client.prototype.work = function() {
      return Promise.resolve().then(function() {
        return self.getTask();
      }).then(function(task) {
        if (!task) {
          throw new NoTask();
        }
        self.task = task;
        return self.prepare();
      }).then(function() {
        return self.judge();
      }).then(function(report_data) {
        return self.report(report_data);
      })["catch"](NoTask, function() {
        return Promise.delay(2000);
      })["catch"](function(err) {
        return console.log(err.message);
      });
    };

    judge_client.prototype.mkdir = function() {
      var data_path, submission_path, work_path;
      work_path = path.resolve(__dirname, work_dirname, self.name);
      data_path = path.resolve(work_path, data_dirname);
      submission_path = path.resolve(work_path, submission_dirname);
      return child_process_promised.execPromised("mkdir -p " + data_path + " " + submission_path);
    };

    judge_client.prototype.init = function() {
      process.on('SIGTERM', function() {
        return self.stop();
      });
      return Promise.resolve().then(function() {
        return self.mkdir();
      }).then(function() {
        return self.start();
      }).then(function() {
        process.disconnect && process.disconnect();
        return console.log("Stopped.");
      })["catch"](function(err) {
        return console.log(err);
      });
    };

    judge_client.prototype.stop = function() {
      return self.isStopped = true;
    };

    judge_client.prototype.start = function() {
      self.isStopped = false;
      return promiseWhile(self.work);
    };

    return judge_client;

  })();

  module.exports = judge_client;

}).call(this);

//# sourceMappingURL=judge_client_new.js.map
