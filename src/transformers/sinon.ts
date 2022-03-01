import core, { API, FileInfo } from 'jscodeshift'

import {
  chainContainsUtil,
  createCallUtil,
  getNodeBeforeMemberExpressionUtil,
  isExpectCallUtil,
} from '../utils/chai-chain-utils'
import finale from '../utils/finale'
import { removeDefaultImport } from '../utils/imports'
import { findParentOfType } from '../utils/recast-helpers'
import {
  getExpectArg,
  isExpectSinonCall,
  isExpectSinonObject,
  modifyVariableDeclaration,
} from '../utils/sinon-helpers'

const SINON_CALL_COUNT_METHODS = [
  'called',
  'calledOnce',
  'calledTwice',
  'calledThrice',
  'callCount',
  'notCalled',
]
const CHAI_CHAIN_MATCHERS = new Set(['be', 'eq', 'eql', 'equal'])
const SINON_CALLED_WITH_METHODS = ['calledWith', 'notCalledWith']
const SINON_SPY_METHODS = ['spy', 'stub']
const SINON_MOCK_RESETS = {
  reset: 'mockReset',
  restore: 'mockRestore',
}
const SINON_MATCHERS = {
  array: 'Array',
  func: 'Function',
  number: 'Number',
  object: 'Object',
  string: 'String',
}
const SINON_MATCHERS_WITH_ARGS = {
  array: 'object',
  func: 'function',
  number: 'number',
  object: 'object',
  string: 'string',
}
const EXPECT_PREFIXES = new Set(['to'])

function getEndofStatement(np) {
  const rootPath = np.scope.getGlobalScope().path
  let path = np.parentPath
  let levels = 0
  // get end of expression
  while (
    path !== rootPath &&
    path.node.type !== 'ExpressionStatement' &&
    path.node.type !== 'VariableDeclarator'
  ) {
    path = path.parentPath
    levels++
  }

  return { path, levels }
}

function isInBeforeEachBlock(np) {
  const rootPath = np.scope.getGlobalScope().path
  let { path } = getEndofStatement(np)

  // find first call expression and check if name is `beforeEach`
  while (path !== rootPath && path.node.type !== 'CallExpression') {
    path = path.parentPath
  }

  return path.node.callee?.name === 'beforeEach'
}

/* 
  expect(spy.called).to.be(true) -> expect(spy).toHaveBeenCalled()
  expect(spy.callCount).to.equal(2) -> expect(spy).toHaveBeenCalledTimes(2)
*/
function transformCallCountAssertions(j, ast) {
  const chainContains = chainContainsUtil(j)
  const getAllBefore = getNodeBeforeMemberExpressionUtil(j)
  const createCall = createCallUtil(j)

  ast
    .find(j.CallExpression, {
      callee: {
        type: j.MemberExpression.name,
        property: {
          name: (name) => CHAI_CHAIN_MATCHERS.has(name.toLowerCase()),
        },
        object: (node) =>
          isExpectSinonObject(node, SINON_CALL_COUNT_METHODS) &&
          isExpectCallUtil(j, node),
      },
    })
    .replaceWith((np) => {
      const { node } = np
      const expectArg = getExpectArg(node.callee)

      // remove .called/.callCount/etc prop from expect argument
      // eg: expect(Api.get.callCount) -> expect(Api.get)
      j(np)
        .find(j.CallExpression, {
          callee: { name: 'expect' },
        })
        .forEach((np) => {
          np.node.arguments = [expectArg.object]
        })

      /* 
          handle  `expect(spy.withArgs('foo').called).to.be(true)` ->
                  `expect(spy.calledWith(1,2,3)).to.be(true)`
          and let subsequent transform fn take care of converting to
          the final form (ie: see `transformCalledWithAssertions`) 
        */
      if (expectArg.object.callee?.property?.name === 'withArgs') {
        // change .withArgs() -> .calledWith()
        expectArg.object.callee.property.name = 'calledWith'
        return node
      }

      const expectArgSinonMethod = expectArg.property.name

      const isPrefix = (name) => EXPECT_PREFIXES.has(name)
      const negated =
        chainContains('not', node.callee, isPrefix) || node.arguments?.[0].value === false // eg: .to.be(false)
      const rest = getAllBefore(isPrefix, node.callee, 'should')

      switch (expectArgSinonMethod) {
        case 'notCalled':
          return createCall('toHaveBeenCalled', [], rest, !negated)
        case 'calledTwice':
          return createCall('toHaveBeenCalledTimes', [j.literal(2)], rest, negated)
        case 'calledOnce':
          return createCall('toHaveBeenCalledTimes', [j.literal(1)], rest, negated)
        case 'called':
        case 'calledThrice':
          return createCall('toHaveBeenCalled', [], rest, negated)
        default:
          // eg: .callCount
          return createCall(
            'toHaveBeenCalledTimes',
            node.arguments.length ? [node.arguments[0]] : [],
            rest,
            negated
          )
      }
    })
}

/* 
  expect(spy.calledWith(1, 2, 3)).to.be(true) -> expect(spy).toHaveBeenCalledWith(1, 2, 3);

  https://github.com/jordalgo/jest-codemods/blob/7de97c1d0370c7915cf5e5cc2a860bc5dd96744b/src/transformers/sinon.js#L267
*/
function transformCalledWithAssertions(j, ast) {
  const chainContains = chainContainsUtil(j)
  const getAllBefore = getNodeBeforeMemberExpressionUtil(j)
  const createCall = createCallUtil(j)

  ast
    .find(j.CallExpression, {
      callee: {
        type: j.MemberExpression.name,
        property: {
          name: (name) => CHAI_CHAIN_MATCHERS.has(name.toLowerCase()),
        },
        object: (node) =>
          isExpectSinonCall(node, SINON_CALLED_WITH_METHODS) && isExpectCallUtil(j, node),
      },
    })
    .replaceWith((np) => {
      const { node } = np
      const expectArg = getExpectArg(node.callee)

      // remove .calledWith() call from expect argument
      j(np)
        .find(j.CallExpression, {
          callee: { name: 'expect' },
        })
        .forEach((np) => {
          np.node.arguments = [expectArg.callee.object]
        })

      const expectArgSinonMethod = expectArg.callee?.property?.name
      const isPrefix = (name) => EXPECT_PREFIXES.has(name)
      const negated =
        chainContains('not', node.callee, isPrefix) || node.arguments?.[0].value === false // eg: .to.be(false)
      const rest = getAllBefore(isPrefix, node.callee, 'should')

      switch (expectArgSinonMethod) {
        case 'calledWith':
          return createCall('toHaveBeenCalledWith', expectArg.arguments, rest, negated)
        case 'notCalledWith':
          return createCall('toHaveBeenCalledWith', expectArg.arguments, rest, !negated)
        default:
          return node
      }
    })
}

/* 
sinon.stub(Api, 'get') -> jest.spyOn(Api, 'get')
*/
function transformStub(j: core.JSCodeshift, ast, sinonExpression) {
  ast
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: {
          type: 'Identifier',
          name: (name) => SINON_SPY_METHODS.includes(name),
        },
        object: {
          type: 'Identifier',
          name: sinonExpression,
        },
      },
    })
    .replaceWith((np) => {
      const args = np.value.arguments

      // stubbing/spyOn module
      if (args.length >= 2) {
        let spyOn = j.callExpression(
          j.memberExpression(j.identifier('jest'), j.identifier('spyOn')),
          args.slice(0, 2)
        )

        // add mockImplementation call
        if (args.length === 3) {
          spyOn = j.callExpression(
            j.memberExpression(spyOn, j.identifier('mockImplementation')),
            [args[2]]
          )
        }

        const wrapWithMockClear = (node) => {
          return j.callExpression(j.memberExpression(node, j.identifier('mockClear')), [])
        }

        // if stub is wrapped in `beforeEach` statement, add `.mockClear()`
        if (isInBeforeEachBlock(np)) {
          const { path, levels } = getEndofStatement(np)
          if (levels > 0) {
            // if chained, add mockClear to the end
            np.value = spyOn
            if (path.node.type === 'VariableDeclarator') {
              path.node.init = wrapWithMockClear(path.node.init)
            } else if (path.node.type === 'ExpressionStatement') {
              path.node.expression = wrapWithMockClear(path.node.expression)
            }
          } else {
            // create new call expression (append mockClear to statement)
            np.value = wrapWithMockClear(spyOn)
          }
          return np.value
        }

        // not in beforeEach block, just replace `stub` with `spyOn`
        return spyOn
      }

      const jestFnCall = j.callExpression(j.identifier('jest.fn'), [])

      if (args.length === 1) {
        return j.callExpression(
          j.memberExpression(jestFnCall, j.identifier('mockImplementation')),
          args
        )
      }

      // jest mock function
      return jestFnCall
    })
}

function transformMock(j: core.JSCodeshift, ast) {
  // stub.withArgs(111).returns('foo') => stub.mockImplementation(a1 => {if (a1 === '111') return 'foo' })
  ast
    .find(j.CallExpression, {
      callee: {
        object: {
          callee: {
            property: {
              name: 'withArgs',
            },
          },
        },
        property: { name: 'returns' },
      },
    })
    .replaceWith((np) => {
      const { node } = np

      // `jest.spyOn` or `jest.fn`
      const mockFn = node.callee.object.callee.object
      const mockImplementationArgs = node.callee.object.arguments
      const mockImplementationReturn = node.arguments

      /* 
        TODO - investigate if there any cases where should skip transformation
      */
      // unsupported/untransformable .withArgs, just remove .withArgs from chain
      if (!mockImplementationArgs?.length || !mockImplementationReturn?.length) {
        node.callee = j.memberExpression(mockFn, node.callee.property)
        return node
      }

      const isSinonMatcherArg = (arg) =>
        arg.type === 'MemberExpression' &&
        arg.object?.object?.name === 'sinon' &&
        arg.object?.property?.name === 'match'

      // generate conditional expression to match args used in .mockImplementation
      const mockImplementationConditionalExpression = (mockImplementationArgs as any[])
        .map((arg, i) => {
          const argName = j.identifier(`args[${i}]`)
          // handle sinon matchers
          if (isSinonMatcherArg(arg)) {
            const matcherType = SINON_MATCHERS_WITH_ARGS[arg.property.name]
            // `sinon.match.object` -> `typeof args[0] === 'object'`
            if (matcherType) {
              return j.binaryExpression(
                '===',
                j.unaryExpression('typeof', argName),
                j.stringLiteral(matcherType)
              )
            }
            // handle `sinon.match.any` - check for total number of args, eg: `args.length >= ${expectedArgs}
            return j.binaryExpression(
              '>=',
              j.memberExpression(j.identifier('args'), j.identifier('length')),
              j.literal(mockImplementationArgs.length)
            )
          }
          return j.binaryExpression('===', argName, arg)
        })
        .reduce((logicalExp: any, binExp: any, i) => {
          if (i === 0) {
            return binExp
          }
          return j.logicalExpression('&&', logicalExp, binExp)
        })

      const mockImplementationFn = j.arrowFunctionExpression(
        [j.spreadPropertyPattern(j.identifier('args'))],
        j.blockStatement([
          j.ifStatement(
            mockImplementationConditionalExpression,
            j.returnStatement(mockImplementationReturn[0])
          ),
        ])
      )

      // `jest.fn` or `jest.spyOn`
      return j.callExpression(
        j.memberExpression(mockFn, j.identifier('mockImplementation')),
        [mockImplementationFn]
      )
    })

  // any remaining `.returns()` -> `.mockReturnValue()`
  ast
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { type: 'Identifier', name: 'returns' },
      },
    })
    .forEach((np) => {
      np.node.callee.property.name = 'mockReturnValue'
    })
}

/* 
  handles mock resets/clears/etc:
  sinon.restore() -> jest.restoreAllMocks()
  stub.restore() -> stub.mockRestore()
  stub.reset() -> stub.mockReset()
*/
function transformMockResets(j, ast) {
  ast
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'sinon',
        },
        property: {
          type: 'Identifier',
          name: 'restore',
        },
      },
    })
    .forEach((np) => {
      np.node.callee.object.name = 'jest'
      np.node.callee.property.name = 'restoreAllMocks'
    })

  ast
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: {
          type: 'Identifier',
          name: (name) => name in SINON_MOCK_RESETS,
        },
      },
    })
    .forEach((np) => {
      const name = SINON_MOCK_RESETS[np.node.callee.property.name]
      np.node.callee.property.name = name
    })
}

/* 
  sinon.match({ ... }) -> expect.objectContaining({ ... })
  // .any. matches:
  sinon.match.[any|number|string|object|func|array] -> expect.any(type)
*/
function transformMatch(j, ast) {
  ast
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'sinon',
        },
        property: {
          type: 'Identifier',
          name: 'match',
        },
      },
    })
    .replaceWith((np) => {
      // TODO - determine if should recursively wrap nested objects with expect.objectContaining
      const args = np.node.arguments
      return j.callExpression(j.identifier('expect.objectContaining'), args)
    })

  ast
    .find(j.MemberExpression, {
      type: 'MemberExpression',
      object: {
        object: {
          name: 'sinon',
        },
        property: {
          name: 'match',
        },
      },
    })
    .replaceWith((np) => {
      const { name } = np.node.property
      const constructorType = SINON_MATCHERS[name]
      if (constructorType) {
        return j.callExpression(j.identifier('expect.any'), [
          j.identifier(constructorType),
        ])
      }
      return j.callExpression(j.identifier('expect.anything'), [])
    })
}

function transformMockTimers(j, ast) {
  // sinon.useFakeTimers() -> jest.useFakeTimers()
  ast
    .find(j.CallExpression, {
      callee: {
        object: {
          name: 'sinon',
        },
        property: {
          name: 'useFakeTimers',
        },
      },
    })
    .forEach((np) => {
      const { node } = np
      node.callee.object.name = 'jest'

      // if `const clock = sinon.useFakeTimers()`, remove variable dec
      const parentAssignment =
        findParentOfType(np, j.VariableDeclaration.name) ||
        findParentOfType(np, j.AssignmentExpression.name)

      if (parentAssignment) {
        if (parentAssignment.value?.type === j.AssignmentExpression.name) {
          const varName = parentAssignment.value.left?.name
          // debug(parentAssignment)

          // clock = sinon.useFakeTimers() -> sinon.useFakeTimers()
          parentAssignment.parentPath.value.expression = node

          // remove global variable declaration
          const varNp = np.scope.lookup(varName).getBindings()?.[varName]?.[0]
          if (varNp) {
            modifyVariableDeclaration(varNp, null)
          }

          // const clock = sinon.useFakeTimers() -> sinon.useFakeTimers()
        } else if (parentAssignment.parentPath.name === 'body') {
          modifyVariableDeclaration(np, j.expressionStatement(node))
        }
      }
    })

  // clock.tick(n) -> jest.advanceTimersByTime(n)
  ast
    .find(j.CallExpression, {
      callee: {
        object: {
          type: 'Identifier',
        },
        property: {
          name: 'tick',
        },
      },
    })
    .forEach((np) => {
      const { node } = np
      node.callee.object.name = 'jest'
      node.callee.property.name = 'advanceTimersByTime'
    })

  /* 
    `stub.restore` shares the same property name as `sinon.useFakeTimers().restore`
    so only transform those with `clock` object which seems to be the common name used
    for mock timers throughout our codebase
  */
  // clock.restore() -> jest.useRealTimers()
  ast
    .find(j.CallExpression, {
      callee: {
        object: {
          name: 'clock',
        },
        property: {
          name: 'restore',
        },
      },
    })
    .forEach((np) => {
      const { node } = np
      node.callee.object.name = 'jest'
      node.callee.property.name = 'useRealTimers'
    })
}

export default function transformer(fileInfo: FileInfo, api: API, options) {
  const j = api.jscodeshift
  const ast = j(fileInfo.source)

  const sinonExpression = removeDefaultImport(j, ast, 'sinon-sandbox')

  if (!sinonExpression) {
    // console.warn(`no sinon for "${fileInfo.path}"`)
    if (!options.skipImportDetection) {
      return fileInfo.source
    }
    // return null
  }

  transformStub(j, ast, sinonExpression)
  transformMockTimers(j, ast)
  transformMock(j, ast)
  transformMockResets(j, ast)
  transformCallCountAssertions(j, ast)
  transformCalledWithAssertions(j, ast)
  transformMatch(j, ast)

  return finale(fileInfo, j, ast, options)
}
