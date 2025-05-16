const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST'
  };
  
  exports.success = (data = {}) => ({
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(data),
  });
  
  exports.error = (message = "Something went wrong", code = 500) => ({
    statusCode: code,
    headers: corsHeaders,
    body: JSON.stringify({ error: message }),
  });