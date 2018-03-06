function Assert ({ name, section, additionalMsg }) {
  function enums (value, enums) {
    if (enums.length > 0 && !enums.includes(value)) {
      throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${name} must be a one of the following [${enums.toString(', ')}]`)
    }
    return true
  }

  function notUndefined (value) {
    if (value === undefined) {
      throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${name} instance in ${section} is required and must be supplied`)
    }
    return true
  }

  function type (value, type) {
    let pass = true
    if (type === 'number' && isNaN(value)) {
      pass = false
    } else if (type === 'array' && !Array.isArray(value)) {
      pass = false
    } else if (typeof value !== type && type !== 'array' && type !== 'number') {
      pass = false
    }
    if (!pass) {
      throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${name} instance in ${section} must be of type: ${type}`)
    }
    return true
  }

  function required (value, schema) {
    const keys = Object.keys(value)
    for (const key of schema) {
      if (!keys.includes(key)) {
        throw new Error(`${additionalMsg !== undefined ? `${additionalMsg}/` : ''}${key} instance in ${section} is required and must be supplied`)
      }
    }
    return true
  }

  return {
    enums,
    notUndefined,
    type,
    required
  }
}

module.exports = Assert
