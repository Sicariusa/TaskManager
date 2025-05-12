/**
 * Formats a successful API response
 * @param {object|array|string} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {object} - Formatted response object
 */
const success = (data, statusCode = 200) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify({
      success: true,
      data
    })
  };
};

/**
 * Formats an error API response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @returns {object} - Formatted error response object
 */
const error = (message, statusCode = 400) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify({
      success: false,
      error: message
    })
  };
};

module.exports = { success, error }; 