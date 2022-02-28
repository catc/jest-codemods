/* eslint-env jest */
import chalk from 'chalk'

import { wrapPlugin } from '../utils/test-helpers'
import plugin from './sinon'

chalk.level = 0

const wrappedPlugin = wrapPlugin(plugin)
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation().mockClear()
})

function expectTransformation(source, expectedOutput, options = {}) {
  const result = wrappedPlugin(source, options)
  expect(result).toBe(expectedOutput)
  expect(console.warn).toBeCalledTimes(0)
}

it('removes imports', () => {
  expectTransformation(
    `
      import foo from 'foo'
      import sinon from 'sinon-sandbox';
`,
    `
      import foo from 'foo'
`
  )
})

describe('spies and stubs', () => {
  it('handles spies', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        const stub = sinon.stub(Api, 'get')
        sinon.stub(I18n, 'extend');
        sinon.stub(AirbnbUser, 'current').returns(currentUser);
        sinon.spy(I18n, 'extend');
        sinon.spy();
        sinon.spy(() => 'foo');
`,
      `
        const stub = jest.spyOn(Api, 'get')
        jest.spyOn(I18n, 'extend');
        jest.spyOn(AirbnbUser, 'current').mockReturnValue(currentUser);
        jest.spyOn(I18n, 'extend');
        jest.fn();
        jest.fn().mockImplementation(() => 'foo');
`
    )
  })

  it('handles 3rd argument implementation fn', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        sinon.stub(I18n, 'extend', () => 'foo');
`,
      `
        jest.spyOn(I18n, 'extend').mockImplementation(() => 'foo');
`
    )
  })

  it('mock clear if spy added in beforeEach', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'

        beforeEach(() => {
          sinon.stub(Api, 'get')
          const s1 = sinon.stub(I18n, 'extend')
          const s2 = sinon.stub(I18n, 'extend').returns('en')
          sinon.stub(L10n, 'language').returns('en')
          sinon.stub(I18n, 'extend', () => 'foo');
        })
`,
      `
        beforeEach(() => {
          jest.spyOn(Api, 'get').mockClear()
          const s1 = jest.spyOn(I18n, 'extend').mockClear()
          const s2 = jest.spyOn(I18n, 'extend').mockReturnValue('en').mockClear()
          jest.spyOn(L10n, 'language').mockReturnValue('en').mockClear()
          jest.spyOn(I18n, 'extend').mockImplementation(() => 'foo').mockClear();
        })
`
    )
  })

  it('handles returns', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        const stub1 = sinon.stub(Api, 'get').returns('foo')
        const stub2 = sinon.stub(Api, 'get').returns(Promise.resolve({ foo: '1' }))
`,
      `
        const stub1 = jest.spyOn(Api, 'get').mockReturnValue('foo')
        const stub2 = jest.spyOn(Api, 'get').mockReturnValue(Promise.resolve({ foo: '1' }))
`
    )
  })

  it('handles .withArgs returns', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'

        sinon.stub().withArgs('foo').returns('something')
        sinon.stub().withArgs('foo', 'bar').returns('something')
        sinon.stub().withArgs('foo', 'bar', 1).returns('something')
        sinon.stub(Api, 'get').withArgs('foo', 'bar', 1).returns('something')
        const stub = sinon.stub(foo, 'bar').withArgs('foo', 1).returns('something')
        sinon.stub(foo, 'bar').withArgs('foo', sinon.match.object).returns('something')
        sinon.stub().withArgs('foo', sinon.match.any).returns('something')
`,
      `
        jest.fn().mockImplementation((...args) => {
                if (args[0] === 'foo')
                        return 'something';
        })
        jest.fn().mockImplementation((...args) => {
                if (args[0] === 'foo' && args[1] === 'bar')
                        return 'something';
        })
        jest.fn().mockImplementation((...args) => {
                if (args[0] === 'foo' && args[1] === 'bar' && args[2] === 1)
                        return 'something';
        })
        jest.spyOn(Api, 'get').mockImplementation((...args) => {
                if (args[0] === 'foo' && args[1] === 'bar' && args[2] === 1)
                        return 'something';
        })
        const stub = jest.spyOn(foo, 'bar').mockImplementation((...args) => {
                if (args[0] === 'foo' && args[1] === 1)
                        return 'something';
        })
        jest.spyOn(foo, 'bar').mockImplementation((...args) => {
                if (args[0] === 'foo' && typeof args[1] === 'object')
                        return 'something';
        })
        jest.fn().mockImplementation((...args) => {
                if (args[0] === 'foo' && args.length >= 2)
                        return 'something';
        })
`
    )
  })
})

describe('mocks', () => {
  it('handles creating mocks', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        const stub = sinon.stub()
`,
      `
        const stub = jest.fn()
`
    )
  })

  it('handles resets/clears', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        stub.restore()
        Api.get.restore()
        Api.get.reset()
        sinon.restore()
`,
      `
        stub.mockRestore()
        Api.get.mockRestore()
        Api.get.mockReset()
        jest.restoreAllMocks()
`
    )
  })
})

describe('sinon.match', () => {
  it('handles creating mocks', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'

        sinon.match({
          foo: 'foo'
        })
        sinon.match({
          foo: sinon.match({
            bar: 'bar'
          })
        })
        expect(foo).toEqual(sinon.match.number)
        foo(sinon.match.number)
        foo(sinon.match.string)
        foo(sinon.match.object)
        foo(sinon.match.func)
        foo(sinon.match.array)
        foo(sinon.match.any)
`,
      `
        expect.objectContaining({
          foo: 'foo'
        })
        expect.objectContaining({
          foo: expect.objectContaining({
            bar: 'bar'
          })
        })
        expect(foo).toEqual(expect.any(Number))
        foo(expect.any(Number))
        foo(expect.any(String))
        foo(expect.any(Object))
        foo(expect.any(Function))
        foo(expect.any(Array))
        foo(expect.anything())
`
    )
  })
})

describe('mock calls', () => {
  it('handles call counts', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        expect(spy.called).toBe(true)
        expect(spy.called).toBe(false)
        expect(logSignupLaunchedFromNav.called).toEqual(true);
        expect(logSignupLaunchedFromNav.called).toEqual(false);
`,
      `
        expect(spy).toHaveBeenCalled();
        expect(spy).not.toHaveBeenCalled();
        expect(logSignupLaunchedFromNav).toHaveBeenCalled();
        expect(logSignupLaunchedFromNav).not.toHaveBeenCalled();
`
    )
  })

  it('handles call counts with args', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        expect(spy.withArgs('foo', bar).called).toBe(true)
        expect(spy.withArgs('foo', bar).called).toBe(false)
`,
      `
        expect(spy).toHaveBeenCalledWith('foo', bar);
        expect(spy).not.toHaveBeenCalledWith('foo', bar);
`
    )
  })

  it('handles calledWith', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        expect(spy.calledWith(1, 2, 3)).toBe(true)
        expect(spy.notCalledWith(1, 2, 3)).toBe(true)
`,
      `
        expect(spy).toHaveBeenCalledWith(1, 2, 3);
        expect(spy).not.toHaveBeenCalledWith(1, 2, 3);
`
    )
  })
})

describe('mock timers', () => {
  it('handles timers', () => {
    expectTransformation(
      `
        import sinon from 'sinon-sandbox'
        sinon.useFakeTimers()
        clock.restore()
        clock.tick(5)

        let clock1
        beforeEach(() => {
          foo()
          clock1 = sinon.useFakeTimers()
          bar()
        })

        foo()
        const clock = sinon.useFakeTimers()
        bar()
`,
      `
        jest.useFakeTimers()
        jest.useRealTimers()
        jest.advanceTimersByTime(5)

        beforeEach(() => {
          foo()
          jest.useFakeTimers()
          bar()
        })

        foo()
        jest.useFakeTimers();
        bar()
`
    )
  })
})
