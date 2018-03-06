const YAML = require('yamljs')
const swaggerParser = require('swagger-parser')
const Assert = require('./assert')

function ValidatorMiddleware (path) {
  async function loadYamlFile () {
    const swaggerSchema = YAML.load(path)
    await swaggerParser.validate(swaggerSchema)
    return await swaggerParser.dereference(swaggerSchema)
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

  function processQuery (queryFromUser, queryFromSchema) {
    const newQuery = {}
    for (let query of queryFromSchema) {
      const { name, type } = query
      const enums = query.enum || []
      const dataFromUser = queryFromUser[name]
      if (dataFromUser !== undefined) {
        const assert = Assert({ section: 'query', name })
        assert.type(dataFromUser, type)
        assert.enums(dataFromUser, enums)
        newQuery[name] = dataFromUser
      }
    }
    return newQuery
  }

  function processParams (paramsFromUser, paramsFromSchema) {
    for (let param of paramsFromSchema) {
      const { name, type } = param
      const enums = param.enum || []
      const dataFromUser = paramsFromUser[name]
      const assert = Assert({ section: 'params', name })
      assert.notUndefined(dataFromUser)
      assert.type(dataFromUser, type)
      assert.enums(dataFromUser, enums)
    }
  }

  function processBody (bodyFromUser = {}, bodyFromSchema, additionalMsg) {
    const { properties = [], required = [] } = bodyFromSchema
    const newBody = {}
    for (let param in properties) {
      const dataFromUser = bodyFromUser[param]
      const { type, items } = properties[param]
      const enums = properties[param].enum || []

      const assert = Assert({ section: 'body', name: param, additionalMsg })
      assert.notUndefined(dataFromUser)
      assert.type(dataFromUser, type)
      assert.enums(dataFromUser, enums)

      // recursive call for complex data types
      if (type === 'array') {
        dataFromUser.map(item => processBody({ [param]: item }, { properties: { [param]: items } }, additionalMsg))
      } else if (type === 'object') {
        processBody(dataFromUser, properties[param], `${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${param}`)
      }

      newBody[param] = dataFromUser
    }
    const assert = Assert({ section: 'body', additionalMsg })
    assert.required(newBody, required)
    return newBody
  }

  async function handler (req, res, next) {
    const { path, method } = req.route
    let schema = null
    try {
      schema = await loadYamlFile(path)
    } catch (err) {
      console.error(err)
      return res.send(500, {message: 'Swagger file failed to load correctly, see internal logs for more information'})
    }
    const { basePath, paths } = schema

    try {
      const jsonschema = getPathSchema(path, method, basePath, paths)

      const queries = jsonschema.parameters.filter(item => item.in === 'query')
      req.query = processQuery(req.query, queries)

      const params = jsonschema.parameters.filter(item => item.in === 'path')
      processParams(req.params, params)

      const body = jsonschema.parameters.filter(item => item.in === 'body')
      req.body = processBody(req.body, body.length !== 0 ? body[0].schema : {})
    } catch (err) {
      return res.send(400, {message: err.message})
    }

    return next()
  }

  return handler
}

module.exports = ValidatorMiddleware
