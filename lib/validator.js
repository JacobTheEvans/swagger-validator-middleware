const YAML = require('yamljs')
const swaggerParser = require('swagger-parser')
const Assert = require('./assert')

function ValidatorMiddleware (path) {
  let schema = {}
  async function init (path) {
    const swaggerSchema = YAML.load(path)
    await swaggerParser.validate(swaggerSchema)
    schema = await swaggerParser.dereference(swaggerSchema)
  }

  async function middleware (req, res, next) {
    const { path, method } = req.route
    const { basePath, paths } = schema
    try {
      const routeschema = getPathSchema(path, method, basePath, paths)
      // Check query
      const queries = routeschema.parameters.filter(item => item.in === 'query')
      req.query = processNonComplex(req.query, queries, 'query')
      // Check Params
      const params = routeschema.parameters.filter(item => item.in === 'path')
      req.params = processNonComplex(req.params, params, 'params', true)
      // Check body
      const body = routeschema.parameters.filter(item => item.in === 'body')
      req.body = processComplex(req.body, body.length !== 0 ? body[0].schema : {}, 'body')
    } catch (err) {
      return res.send(400, {message: err.message})
    }
    return next()
  }

  function getPathSchema (pathFromUser, httpMethod, serverBasePath, pathsFromSchema) {
    for (let key in pathsFromSchema) {
      let route = `${serverBasePath}${key}`
      route = route.replace(/{/g, ':')
      route = route.replace(/}/g, '')
      if (route === pathFromUser) {
        const methodStr = httpMethod.toLowerCase()
        if (Object.keys(pathsFromSchema[key]).includes(methodStr)) {
          return pathsFromSchema[key][methodStr]
        }
      }
    }
    throw new Error('Endpoint not found in server configuration')
  }

  function processNonComplex (user, schema, section, shouldBeDefined = false) {
    const newObj = {}
    for (let check of schema) {
      const { name, type } = check
      const enums = check.enum || []
      const data = user[name]
      const assert = Assert({ section, name })
      if (shouldBeDefined) {
        assert.notUndefined(data)
        assert.type(data, type)
        assert.enums(data, enums)
        newObj[name] = data
      } else if (data !== undefined) {
        assert.type(data, type)
        assert.enums(data, enums)
        newObj[name] = data
      }
    }
    return newObj
  }

  function processComplex (user = {}, schema, section, additionalMsg) {
    const { properties = [], required = [] } = schema
    const newObj = {}
    for (let param in properties) {
      const data = user[param]
      const { type, items } = properties[param]
      const enums = properties[param].enum || []
      const assert = Assert({ name: param, section, additionalMsg })
      assert.notUndefined(data)
      assert.type(data, type)
      assert.enums(data, enums)
      // recursive call for complex data types
      if (type === 'array') {
        data.map(item => processComplex({ [param]: item }, { properties: { [param]: items } }, section, additionalMsg))
      } else if (type === 'object') {
        processComplex(data, properties[param], section, `${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${param}`)
      }
      newObj[param] = data
    }
    const assert = Assert({ section: 'body', additionalMsg })
    assert.required(newObj, required)
    return newObj
  }

  // Setup schema file
  init(path)
  return middleware
}

module.exports = ValidatorMiddleware
