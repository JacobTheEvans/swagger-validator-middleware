# swagger-validator-middleware
Restify middleware for validating [Swagger 2.0 specifications](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md)

## How to install

```
npm install swagger-validator-middleware
```

or

```
yarn add swagger-validator-middleware
```


## How to use

```javascript
const restify = require('restify')
const Validator = require('swagger-validator-middleware')

const server = restify.createServer()

// setup plugins
server.use(restify.plugins.acceptParser(server.acceptable))
server.use(restify.plugins.queryParser())
server.use(restify.plugins.bodyParser())

// setup validator
const validator = Validator(__dirname + '/path/to/swagger.yaml')
server.use(validator)

// setup your routes
server.get('/', (req, res, next) => {
  res.send('Example route')
  next()
})

server.listen(port)
```
