const YAML = require('yamljs')
const swaggerParser = require('swagger-parser')

function ValidatorMiddleware (path) {
  async function loadYamlFile () {
    const swaggerSchema = YAML.load(path)
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
    for (let i = 0; i < queryFromSchema.length; i++) {
      const param = queryFromSchema[i]
      const dataFromQuery = queryFromUser[param.name]
      if (dataFromQuery !== undefined) {
        let pass = true
        if (typeof dataFromQuery !== queryFromSchema[i].type) {
          pass = false
        }
        if (queryFromSchema[i].type === 'number' && !isNaN(dataFromQuery)) {
          pass = true
        }
        if (!pass) {
          throw new Error(`${param.name} instance must be a type of ${queryFromSchema[i].type} in request query`)
        } else {
          newQuery[param.name] = dataFromQuery
        }
      }
    }
    return newQuery
  }

  function processParams (paramsFromUser, paramsFromSchema) {
    for (let i = 0; i < paramsFromSchema.length; i++) {
      const param = paramsFromSchema[i]
      const dataFromParam = paramsFromUser[param.name]
      if (dataFromParam !== undefined) {
        let pass = true
        if (typeof dataFromParam !== paramsFromSchema[i].type) {
          pass = false
        }
        if (paramsFromSchema[i].type === 'number' && !isNaN(dataFromParam)) {
          pass = true
        }
        if (dataFromParam === '') {
          throw new Error(`${param.name} instance is required and must be supplied in request params`)
        }
        if (!pass) {
          throw new Error(`${param.name} instance must be a type of ${paramsFromSchema[i].type}`)
        }
      } else {
        throw new Error(`${param.name} instance is required and must be supplied in request params`)
      }
    }
  }

  function processBody (bodyFromUser = {}, bodyFromSchema, additionalMsg) {
    const { properties = [], required = [] } = bodyFromSchema
    const newBody = {}
    for (let param in properties) {
      const dataFromUser = bodyFromUser[param]
      if (dataFromUser !== undefined) {
        let pass = true
        if (properties[param].type === 'array' && Array.isArray(dataFromUser)) {
          for (let i = 0; i < dataFromUser.length; i++) {
            processBody({ [param]: dataFromUser[i] }, {
              properties: { [param]: properties[param].items }
            }, additionalMsg)
          }
        } else if (typeof dataFromUser === properties[param].type && typeof dataFromUser === 'object') {
          processBody(dataFromUser, properties[param], param)
        } else if (typeof dataFromUser !== properties[param].type) {
          pass = false
        }
        // Override pass for number type
        if (properties[param].type === 'number' && !isNaN(dataFromUser)) {
          pass = true
        }
        if (!pass) {
          throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}` : ''}/${param} instance must be a type of ${properties[param].type}`)
        } else {
          newBody[param] = dataFromUser
        }
      }
    }
    const keysFromNewBody = Object.keys(newBody)
    for (let i = 0; i < required.length; i++) {
      if (!keysFromNewBody.includes(required[i])) {
        throw new Error(`${required[i]} instance is required and must be supplied in request body`)
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
