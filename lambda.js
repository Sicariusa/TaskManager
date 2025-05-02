const awsServerlessExpress = require('aws-serverless-express');
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

const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => {
  // Log the event for debugging (remove in production if sensitive data is present)
  console.log('Event:', JSON.stringify(event));
  
  return awsServerlessExpress.proxy(server, event, context);
}; 