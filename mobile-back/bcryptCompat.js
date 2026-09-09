const { isDesktop } = require('./runtime');

if (isDesktop()) {
  module.exports = require('bcryptjs');
} else {
  module.exports = require('bcrypt');
}
