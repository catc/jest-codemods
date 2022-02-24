export function isExpectSinonCall(obj, sinonMethods) {
  if (obj.type === 'CallExpression' && obj.callee.name === 'expect') {
    const args = obj.arguments
    if (args.length) {
      return (
        args[0].type === 'CallExpression' &&
        args[0].callee.type === 'MemberExpression' &&
        sinonMethods.includes(args[0].callee.property.name)
      )
    }
    return false
  } else if (obj.type === 'MemberExpression') {
    return isExpectSinonObject(obj.object, sinonMethods)
  }
}

export function isExpectSinonObject(obj, sinonMethods) {
  if (obj.type === 'CallExpression' && obj.callee.name === 'expect') {
    const args = obj.arguments
    if (args.length) {
      return (
        args[0].type === 'MemberExpression' &&
        sinonMethods.includes(args[0].property.name)
      )
    }
    return false
  } else if (obj.type === 'MemberExpression') {
    return isExpectSinonObject(obj.object, sinonMethods)
  }
}

export function isExpectNegation(expectStatement) {
  const propName = expectStatement.expression.callee.property.name
  const hasNot =
    expectStatement.expression.callee.object.type === 'MemberExpression' &&
    expectStatement.expression.callee.object.property.name === 'not'
  const argIsFalse = expectStatement.expression.arguments[0].value === false
  const assertFalsy =
    (propName === 'toBe' && argIsFalse) || propName === 'toBeFalsy' || argIsFalse
  if (hasNot && assertFalsy) {
    return false
  }
  return hasNot || assertFalsy
}

export function getExpectArg(obj) {
  if (obj.type === 'MemberExpression') {
    return getExpectArg(obj.object)
  } else {
    return obj.arguments[0]
  }
}

export function createExpectStatement(j, expectArg, negation, assertMethod, assertArgs) {
  return j.expressionStatement(
    j.callExpression(
      j.memberExpression(
        j.callExpression(j.identifier('expect'), [expectArg]),
        j.identifier((negation ? 'not.' : '') + assertMethod)
      ),
      assertArgs ? assertArgs : []
    )
  )
}
