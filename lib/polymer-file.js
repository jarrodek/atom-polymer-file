'use strict';

/* global atom */

const CompositeDisposable = require('atom').CompositeDisposable;
const PolymerFileView = require('./polymer-file-view.js');
const Directory = require('atom').Directory;
const File = require('atom').File;
const crisper = require('crisper');

/**
 * A helper for creating Polymer files.
 * It also contains methods for crispering files and folders so the polymer files becomes CSP
 * compilant (e.g. for Chrome Apps).
 */
var PolymerFile = {

  config: {
    csp: {
      type: 'boolean',
      default: false,
      description: 'If enabled will create separate JavaScript file for the element'
    }
  },

  activate: function() {
    this.subscriptions = new CompositeDisposable();
    var cmdFile = atom.commands.add('.tree-view .directory > .header > .name',
      'polymer-file:create',
      function(e) {
        return PolymerFile.createFile(e.target.dataset.path);
      }
    );
    var crisperCmd = atom.commands.add('.tree-view .directory > .header > .name',
      'polymer-file:crisper-folder',
      function(e) {
        return PolymerFile.crisper(e.target.dataset.path);
      }
    );
    this.subscriptions.add(cmdFile);
    this.subscriptions.add(crisperCmd);
  },
  deactivate() {
    this.subscriptions.dispose();
    if (this.view) {
      this.view.destroy();
    }
  },

  createFile: function(path) {
    this.view = new PolymerFileView(path);
  },

  crisper: function(path) {
    if (!path) {
      return;
    }
    var dir = new Directory(path);
    dir.exists().then((exists) => {
      if (!exists) {
        return;
      }
      PolymerFile._crisperDir(dir);
    });
  },

  _crisperDir: function(dir) {
    var pathStr = dir.getPath();
    var workspace = atom.views.getView(atom.workspace);
    var result = workspace.querySelector(`.icon-file-directory[data-path="${pathStr}"]`);
    if (result) {
      result.classList.add('crispiring');
    }
    PolymerFile._crisperTree(dir)
    .then(() => {
      result.classList.remove('crispiring');
    })
    .catch((e) => {
      result.classList.add('crispiring');
      console.error(e);
    });
  },
  /**
   * Crisper directory tree recursively.
   *
   * @param {Dirctory} dir a directory to scan
   */
  _crisperTree: function(dir) {
    return PolymerFile._getFilesOnly(dir)
    .then((entries) => {
      var files = [];
      entries.forEach((list) => {
        var src = (list[0] instanceof Array) ? list[0] : list;
        files = files.concat(src);
      });
      return files;
    })
    .then((list) => PolymerFile._scanFiles(list))
    .then((scanned) => {
      let promises = [];
      scanned.forEach((file) => {
        promises.push(PolymerFile._crisperFile(file));
      });
      return Promise.all(promises);
    });
  },
  _getFilesOnly: function(dir) {
    return PolymerFile._getEntries(dir)
    .then((entries) => {
      var files = [];
      var promises = [null];
      entries.forEach((item) => {
        if (item.isFile()) {
          files.push(item);
        } else if (item.isDirectory()) {
          promises.push(PolymerFile._getFilesOnly(item));
        }
      });
      promises[0] = Promise.resolve(files);
      return Promise.all(promises);
    });
  },
  _getEntries: function(dir) {
    return new Promise((resolve, reject) => {
      dir.getEntries((error, entries) => {
        if (error) {
          reject(error);
        } else {
          resolve(entries);
        }
      });
    });
  },

  _scanFiles: function(entries) {
    var files = [];
    entries.forEach((item) => {
      var name = item.getBaseName();
      if (name.indexOf('.html') === name.length - 5) {
        files.push(item);
      }
    });
    return files;
  },

  _crisperFile: function(file) {
    var path = file.getParent().getPath();
    var baseName = file.getBaseName().replace('html', '');
    var jsFileName = baseName + 'js';
    var jsPath = path + '/' + jsFileName;

    return file.read().then((text) => {
      var output = crisper({
        source: text,
        jsFileName: jsFileName,
        scriptInHead: false,
        onlySplit: false, // default false
        alwaysWriteScript: false
      });
      var p1 = file.write(output.html);
      var scriptFile = new File(jsPath);
      var p2 = scriptFile.create()
      .then(() => scriptFile.write(output.js));
      return Promise.all([p1, p2]);
    });
  }
};
module.exports = PolymerFile;
