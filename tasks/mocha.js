module.exports = function(grunt) {
  var MochaWrapper = require('./lib/MochaWrapper');
  var fs= require('fs');

  // Helper to capture task output (adapted from tests for grunt-contrib-jshint)
  var capture = function(captureFile, quiet, run, done) {
    var fd;
    if (captureFile) {
      fd = fs.openSync(captureFile, 'w');
    }
    // Hook process.stdout.write
    var hooker = grunt.util.hooker;
    hooker.hook(process.stdout, 'write', {
      // This gets executed before the original process.stdout.write
      pre: function(result) {
        // Write result to file if it was opened
        if (fd) {
          fs.writeSync(fd, result);
        }
        // Prevent the original process.stdout.write from executing if quiet was specified
        if (quiet) {
          return hooker.preempt();
        }
      }
    });
    // Execute the code whose output is to be captured
    run(function(error, failureCount) {
      // close the file if it was opened
      if (fd) {
        fs.closeSync(fd);
      }
      // Restore process.stdout.write to its original value
      hooker.unhook(process.stdout, 'write');
      // Actually test the actually-logged stdout string to the expected value
      done(error, failureCount);
    });
  };

  grunt.registerMultiTask('mochaTest', 'Run node unit tests with Mocha', function() {
    var done = this.async();
    var options = this.options();
    var files = this.files;

    // Another hack copied from
    // https://github.com/gregrperkins/grunt-mocha-hack
    // This time we are preventing grunt handling asynchronous
    // exceptions that are thrown when handling asynchronous exceptions
    // (I think) - See the `asyncSuperTest` scenario
    var uncaughtExceptionHandlers = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    var unmanageExceptions = function() {
      uncaughtExceptionHandlers.forEach(
        process.on.bind(process, 'uncaughtException'));
    };
    var restore = function() {
      unmanageExceptions();
    };

    capture(options.captureFile, options.quiet, function(complete) {
      var mochaWrapper = new MochaWrapper({
        files: files,
        options: options
      });
      mochaWrapper.run(function(error, failureCount) {
        if (error) {
          grunt.log.error('Mocha exploded!');
          grunt.log.error(error.stack);
          complete(error);
        } else {
          // Send a 'done' event with the failureCount and location of 
          // the capture file so we can do some post-processing.
          //
          grunt.event.emit('mochaTest.done', failureCount, options.captureFile);
        
          complete(null, failureCount);
        }
      }, function(eventType, error, obj) {
        // Emit a Grunt Event with whatever we recieve.
        //
        grunt.event.emit('mochaTest.'+eventType, error, obj);
      });
    }, function(error, failureCount) {
      // restore the uncaught exception handlers
      restore();
      if (error) {
        done(false);
      } else {
        done(failureCount === 0);
      }
    });
  });
};
