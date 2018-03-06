const YAML = require('yamljs')
const swaggerParser = require('swagger-parser')

function ValidatorMiddleware (path) {
  async function loadYamlFile () {
    const swaggerSchema = YAML.load(path)
    return await swaggerParser.dereference(swaggerSchema)
  }

  function assertEnums (value, enums, key, additionalMsg) {
    if (enums.length > 0 && !enums.includes(value)) {
      throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${key} must be a one of the following [${enums.toString(', ')}]`)
    }
    return true
  }

  function assertNotUndefined (value, key, section) {
    if (value === undefined) {
      throw new Error(`${key} instance is required and must be supplied in ${section}`)
    }
    return true
  }

  function assertType (expected, provided, key, section) {
    if ((typeof provided !== expected) && (expected === 'number' && isNaN(provided)) || (expected === 'array' && !Array.isArray(provided))) {
      throw new Error(`${key} instance in ${section} must be of type: ${expected}`)
    }
    return true
  }

  function assertValidInput (expected, provided, key, section) {
    assertNotUndefined(provided, key, section)
    assertType(expected, provided, key, section)
    return true
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
        assertType(type, dataFromUser, name, 'query')
        assertEnums(dataFromUser, enums, name)
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
      assertValidInput(type, dataFromUser, name, 'params')
      assertEnums(dataFromUser, enums, name)
    }
  }

  function processBody (bodyFromUser = {}, bodyFromSchema, additionalMsg) {
    const { properties = [], required = [] } = bodyFromSchema
    const newBody = {}

    for (let param in properties) {
      const dataFromUser = bodyFromUser[param]
      const { type, items } = properties[param]
      const enums = properties[param].enum || []
      assertValidInput(type, dataFromUser, param, 'body')
      assertEnums(dataFromUser, enums, param, additionalMsg)
      if (type === 'array') {
        dataFromUser.map(item => processBody({ [param]: item }, { properties: { [param]: items } }, additionalMsg))
      } else if (type === 'object') {
        processBody(dataFromUser, properties[param], param)
      }
      newBody[param] = dataFromUser
    }

    const keysFromNewBody = Object.keys(newBody)
    for (let key of required) {
      if (!keysFromNewBody.includes(key)) {
        throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${key} instance is required and must be supplied in request body`)
      }
    }
    return newBody
  }

  async function handler (req, res, next) {
    const { path, method } = req.route
    let schema = null
    try {
      schema = await loadYamlFile(path)
    } catch (err) {
      console.error(err)
      return res.send(500, {message: err.message})
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
