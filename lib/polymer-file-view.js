'use strict';
var hasProp = {}.hasOwnProperty;
var extend = function(child, parent) {
  for (var key in parent) {
    if (hasProp.call(parent, key)) {
      child[key] = parent[key];
    }
  }
  function Ctor() {
    this.constructor = child;
  }
  Ctor.prototype = parent.prototype;
  child.prototype = new Ctor();
  child.__super__ = parent.prototype; return child;
};

const path = require('path');
const _ = require('underscore-plus');
const ref = require('atom-space-pen-views');
const $ = ref.$;
const TextEditorView = ref.TextEditorView;
const View = ref.View;
const fs = require('fs-plus');
const File = require('atom').File;

/* global atom */
var PolymerFileView;

PolymerFileView = (function(superClass) {
  extend(PolymerFileView, superClass);

  function PolymerFileView(path) {
    this.path = path;
    return PolymerFileView.__super__.constructor.apply(this, arguments);
  }

  PolymerFileView.prototype.previouslyFocusedElement = null;

  PolymerFileView.content = function() {
    return this.div({
      'class': 'package-generator'
    }, () => {
      this.subview('miniEditor', new TextEditorView({
        mini: true
      }));
      this.div({
        'class': 'error',
        outlet: 'error'
      });
      return this.div({
        'class': 'message',
        outlet: 'message'
      });
    });
  };

  PolymerFileView.prototype.initialize = function() {
    this.miniEditor.on('blur', () => {
      return this.close();
    });
    this.attach();
    return atom.commands.add(this.element, {
      'core:confirm': () => {
        return this.confirm();
      },
      'core:cancel': () => {
        this.close();
      }
    });
  };

  PolymerFileView.prototype.destroy = function() {
    if (this.panel) {
      this.panel.destroy();
    }
  };

  PolymerFileView.prototype.attach = function() {
    if (!this.panel) {
      this.panel = atom.workspace.addModalPanel({
        item: this,
        visible: false
      });
    }
    this.previouslyFocusedElement = $(document.activeElement);
    this.panel.show();
    this.message.text('Enter element name');
    this.setPathText('my-element.html');
    return this.miniEditor.focus();
  };

  PolymerFileView.prototype.setPathText = function(placeholderName) {
    var editor = this.miniEditor.getModel();
    editor.setText(path.join(this.path, placeholderName));
    var pathLength = editor.getText().length;
    var placeholderLength = placeholderName.length;
    var directoryIndex = pathLength - placeholderLength;
    return editor.setSelectedBufferRange([[0, directoryIndex + 0],
      [0, directoryIndex + placeholderLength - 5]]);
  };
  /**
   * Closes the dialog.
   */
  PolymerFileView.prototype.close = function() {
    if (!this.panel.isVisible()) {
      return;
    }
    this.panel.hide();
    var elm = this.previouslyFocusedElement;
    return elm ? elm.focus() : void 0;
  };
  /**
   * Handler for dialog confirmation.
   */
  PolymerFileView.prototype.confirm = function() {
    if (this.validPackagePath()) {
      this.createPackageFiles()
      .then((paths) => {
        atom.open({
          pathsToOpen: paths
        });
        this.close();
      });
    } else {
      this.error.text('File already exists at "' + (this.getPolymerFilePath()) + '"');
      this.error.show();
    }
  };
  /**
   * Get full path to the file that is about to be created.
   *
   * @return {String} File full path.
   */
  PolymerFileView.prototype.getPolymerFilePath = function() {
    var packagePath = fs.normalize(this.miniEditor.getText().trim());
    var packageName = _.dasherize(path.basename(packagePath));
    return path.join(path.dirname(packagePath), packageName);
  };
  /**
   * Check if file exists for given path and return false if it is.
   *
   * @return {Boolean} False if this is not valid path for element.
   */
  PolymerFileView.prototype.validPackagePath = function() {
    return !fs.existsSync(this.getPolymerFilePath());
  };

  PolymerFileView.prototype.createPackageFiles = function() {
    var filePath = this.getPolymerFilePath();
    var elementName = this.getPolymerFileName(filePath);
    var isCsp = atom.config.get('polymer-file.csp');
    if (isCsp) {
      return this.createCspFiles(elementName);
    }
    return this.createRegularFile(elementName);
  };
  /**
   * Creates a regular Polymer element file.
   */
  PolymerFileView.prototype.createRegularFile = function(elementName) {
    var html = path.join(__dirname, '..', 'templates', '_polymer_template_name_.html');
    return new File(html).read()
    .then((content) => {
      let html = content.replace(/_polymer_template_name_/g , elementName);
      let htmlPath = path.join(this.path, elementName + '.html');
      let htmlFile = new File(htmlPath);
      return htmlFile.create()
        .then(() => htmlFile.write(html))
        .then(() => [htmlPath]);
    });
  };
  /**
   * Creates a CSP ready Polymer elements consisted of element-name.html file with view definition
   * and element-name.js with logic.
   *
   * @return {Promise} Fulfilled promise when both files are created will return files path
   * in the array.
   */
  PolymerFileView.prototype.createCspFiles = function(elementName) {
    var html = path.join(__dirname, '..', 'templates', 'csp_polymer_template_name_.html');
    var js = path.join(__dirname, '..', 'templates', 'csp_polymer_template_name_.js');

    var htmlPromise = new File(html).read();
    var jsPromise = new File(js).read();

    return Promise.all([htmlPromise, jsPromise])
    .then((result) => {
      let reg = /_polymer_template_name_/g;
      let html = result[0].replace(reg , elementName);
      let js = result[1].replace(reg, elementName);
      return [html, js];
    })
    .then((data) => {
      let htmlPath = path.join(this.path, elementName + '.html');
      let jsPath = path.join(this.path, elementName + '.js');
      let htmlFile = new File(htmlPath);
      let scriptFile = new File(jsPath);
      let p1 = htmlFile.create()
      .then(() => htmlFile.write(data[0]));
      let p2 = scriptFile.create()
      .then(() => scriptFile.write(data[1]));
      return Promise.all([p1, p2])
      .then(() => [htmlPath, jsPath]);
    });
  };

  PolymerFileView.prototype.getPolymerFileName = function(filePath) {
    var file = path.basename(filePath);
    var index = file.lastIndexOf('.');
    if (index === -1) {
      return file;
    }
    return file.substr(0, index);
  };

  return PolymerFileView;

})(View);
module.exports = PolymerFileView;
