export const PROP_WITH_SECONDS_ARGS = [
  'toBe',
  'not.toBe',
  'toEqual',
  'not.toEqual',
  'toMatch',
  'not.toMatch',
]

export const JEST_MATCHER_TO_MAX_ARGS = {
  toBe: 1,
  toBeCalled: 0,
  toBeCalledTimes: 1,
  toBeCalledWith: Infinity,
  toBeLastCalledWith: Infinity,
  toBeCloseTo: 2,
  toBeDefined: 0,
  toBeFalsy: 0,
  toBeGreaterThan: 1,
  toBeGreaterThanOrEqual: 1,
  toBeInstanceOf: 1,
  toBeLessThan: 1,
  toBeLessThanOrEqual: 1,
  toBeNaN: 0,
  toBeNull: 0,
  toBeTruthy: 0,
  toBeUndefined: 0,
  toContain: 1,
  toContainEqual: 1,
  toEqual: 1,
  toHaveBeenCalled: 0,
  toHaveBeenCalledTimes: 1,
  toHaveBeenCalledWith: Infinity,
  toHaveBeenLastCalledWith: Infinity,
  toHaveLength: 1,
  toHaveProperty: 2,
  toMatch: 1,
  toMatchObject: 1,
  toMatchSnapshot: 1,
  toThrow: 1,
  toThrowError: 1,
  toThrowErrorMatchingSnapshot: 0,
}

export const JEST_MOCK_PROPERTIES = new Set(['spyOn', 'fn', 'createSpy'])
