Vue侦听器，顾名思义，它的作用是侦听。当数据变化时，会执行的回调。

侦听器想要知道知道哪些数据会变化，就需要被数据进行依赖收集。

## 侦听器初始化

侦听器初始化，是在`initState`中开始的，

```javascript
export function initState (vm: Component) {
  // ...
  if (opts.watch && opts.watch !== nativeWatch) {
    // 初始化侦听器
    initWatch(vm, opts.watch)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}
```

遍历`watch`，通过`createWatcher`去做处理：

```javascript
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}
```

`createWatcher`是处理用户配置不同类型的`watch`，如果配置的`watch`是一个对象，将`handler`赋值给`options`，并重置`handler = handler.handler`；如果`handler`是一个字符串，从组件的实例上找到该字符串对应的方法，最后通过`$watch`去做处理：

```javascript
Vue.prototype.$watch = function (
  expOrFn: string | Function,
  cb: any,
  options?: Object
): Function {
  const vm: Component = this
  if (isPlainObject(cb)) {
    return createWatcher(vm, expOrFn, cb, options)
  }
  options = options || {}
  options.user = true
  const watcher = new Watcher(vm, expOrFn, cb, options)
  if (options.immediate) {
    try {
      cb.call(vm, watcher.value)
    } catch (error) {
      handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
    }
  }
  return function unwatchFn () {
    watcher.teardown()
  }
}
```

`$watch`方法的主要用途就是实例化`watcher`，这里有一点需要注意的是，实例化`watcher`时传入的配置`options.user = true`，这说明侦听器是`user watcher`。

```javascript
constructor(
  vm: Component,
  expOrFn: string | Function,
  cb: Function,
  options?: ?Object,
  isRenderWatcher?: boolean
) {
  this.vm = vm
  // ...
  // options
  if (options) {
    this.deep = !!options.deep
    this.user = !!options.user
    this.lazy = !!options.lazy
    this.sync = !!options.sync
    this.before = options.before
  } else {
    // ...
  }
  // ...
  if (typeof expOrFn === 'function') {
    this.getter = expOrFn
  } else {
    this.getter = parsePath(expOrFn)
    // ...
  }
  this.value = this.lazy
    ? undefined
    : this.get()
}

export function parsePath (path: string): any {
  // ...
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
```

实例化`watcher`，从这里可以看出`watch`本质是一个`watcher`，一个`user watcher`。它的`getter`是通过`parsePath`解析出来的，在调用`this.get`过程中会调用`getter`，其目的就是，该侦听器**侦听的数据**对它进行依赖收集。

`user watcher`的`getter`非常巧妙，它闭包了执行`parsePath`时传入的`expOrFn`，其实就是用户配置的`watch`的`key`，然后根据这个`key`去组件实例上找到对应的值，这个`key`对应的值就是这个侦听器所侦听的数据，找到了就会触发这个数据`getter`进行依赖收集，将当前的`user watcher`收集起来，这样当数据变化的时候，就可以通知到侦听它的`user watcher`去执行回调。

从上面可以看出，侦听器被依赖收集，是它初始化的过程中执行的。

## 侦听器被派发更新

当数据变化的时候，侦听器对应`user watcher`会去更新：

```javascript
run() {
  if (this.active) {
    const value = this.get()
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      // set new value
      const oldValue = this.value
      this.value = value
      if (this.user) {
        try {
          this.cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        this.cb.call(this.vm, value, oldValue)
      }
    }
  }
}
```

`run`的过程，先通过`get`方法获侦听数据的新值，在执行侦听器的回调，将侦听数据的新值和旧值一并传入。

### 侦听器深度侦听

侦听器可以配置`deep`属性，其目的就是侦听数据如果是对象类型，可以侦听它的属性变化，无论嵌套多深，都可以进行侦听。

```javascript
get() {
  pushTarget(this)
  let value
  const vm = this.vm
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    if (this.user) {
      handleError(e, vm, `getter for watcher "${this.expression}"`)
    } else {
      throw e
    }
  } finally {
    // "touch" every property so they are all tracked as
    // dependencies for deep watching
    if (this.deep) {
      traverse(value)
    }
    // ...
  }
  return value
}

export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}


function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
```

深度侦听就是递归的访问对象上的属性，这样就可以触发这些数据的`getter`进行依赖收集，当这些深层的数据被修改时，侦听它的侦听器就可以侦听到。
