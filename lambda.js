const express = require('express');
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');

// Remove the direct server start since Lambda will handle this
if (app.listen) {
  const listen = app.listen.bind(app);
  app.listen = () => {
    console.warn('Attempted to call app.listen in Lambda environment');
    return app;
  };
  app._listen = listen;
}

// Create serverless handler
const handler = serverlessExpress({
  app,
  respondWithErrors: true, // This helps with debugging
  logSettings: {
    level: 'debug' // Increase logging for troubleshooting
  }
});

// Export the handler
exports.handler = async (event, context) => {
  // Log the event for debugging
  console.log('Event:', JSON.stringify(event));
  return handler(event, context);
}; 