/*

Abstract layer to get configuration.
First looking in shell env after in config.json.
Throw error if configuration not exist.

Example usage:
 var backend_url = config.get('BACKEND_URL');

*/

var nconf = require('nconf');

module.exports = function() {

  nconf.env()
    .file({ file: __dirname + '/../config.json' });

  return {
    'get': function(variableName) {
      var variable = nconf.get(variableName.toUpperCase());

      if (variable == null) {
        throw Error('Configuration ' + variableName + ' nof found.');
      }

      return variable;
    }
  }
};
