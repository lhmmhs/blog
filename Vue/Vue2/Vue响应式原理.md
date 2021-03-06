版本是v2.6.11

引用官网的一句话：

Vue 最独特的特性之一，是其非侵入性的响应式系统。数据模型仅仅是普通的 JavaScript 对象。而当你修改它们时，视图会进行更新。

其工作原理是：

1. 当你把一个普通的 JavaScript 对象传入 Vue 实例作为 `data` 选项，Vue 将遍历此对象所有的属性，并使用 `Object.defineProperty` 把这些属性全部转为响应式`getter/setter`的。
2. 在组件渲染的过程中，会访问这些数据，触发这些属性的`getter`，进行依赖收集。
3. 当这些属性被修改时，会触发它们的`setter`，进行派发更新。

## 数据转化为响应式

实例化`Vue`或实例化组件的过程中，都会执行`initState`这个方法，它是在调用`_init`方法是被执行的，

```javascript
Vue.prototype._init = function (options?: Object) {
  // ...
    
  initState(vm)

  // ...
}


export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
```

`initState`的实现，初始化一系列配置选项`props`，`methods`，`data`，`computed`，`watch`，`data`的的初始化是在`initData`中，其源码：

```javascript
function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  
  // ...
    
  // observe data
  observe(data, true /* asRootData */)
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}
```

判断`data`是否为函数，是，取它返回值，不是，则取自身，通过执行`observe`对`data`进行处理。

```javascript
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}
```

`observe`先判断`value`上是否有`__ob__`这个属性，如果没有，则实例化`Observer`并挂载到`value.__ob__`上，如果是根`data`，会进行`Observer.vmCount++`。

`Observer`类：

```javascript
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}
```

`Observer`类，主要是将自身实例通过`def`挂载到`value.__ob__`上，并实例化`Dep`挂载到自身上的`dep`属性上，最后将传入的数据进行响应式处理。

数据进行响应式处理分为两种情况：

1. 数据是数组类型
2. 数据是纯对象类型

**数据是数组类型**，通过`protoAugment`或`copyAugment`修改数组的方法：

```javascript
// 直接修改数组原型方法
function protoAugment (target, src: Object) {
  target.__proto__ = src
}

// 在数组实例上添加修改后的原生方法，屏蔽原型方法
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}
```
这些修改后的方法：
```javascript
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    // 调用原生
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()
    return result
  })
})
```

在原生方法的基础上，进行了一层包装，包装后的函数首先会调用原生方法，然后判断`push`，`unshift`以及`splice`情况下，对新增元素进行响应式处理，在调用`ob.dep.notify`进行派发更新，这就是当数组使用这些被包装过的方法，可以触发视图更新的原因。

**数据对象是纯对象**，通过`walk`，去执行`defineReactive`：

```javascript
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {...},
    set: function reactiveSetter (newVal) {...}
  })
}
```

`defineReactive`是真正将数据转化为响应式的函数，首先它会去实例化`Dep`，`dep`是每个属性所对应的，然后获取属性预先设置过的`getter/setter`，如果存在的话，那么它会在属性新设置的`getter/setter`中进行调用，如果属性是对象或数组类型，那么就递归的将它们下面的属性进行响应式处理，最后设置属性的`getter/setter`。

### Dep

```javascript
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}
```

`Dep`是个类，每个数据都有与其对应的`Dep`实例，数据是被观察的对象，`Dep`实例的作用就是管理**被观察的对象**和**观察者**之间的关系。

```javascript
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // 渲染watcher
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

 // ...
}

```

`Watcher`是个类，它就是上面所说的**观察者**。

## 依赖收集

数据被访问时，会触发它的`getter`：

```javascript
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {

  const dep = new Dep()

  //...
  
  // 响应式对象的__ob__
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {...})
}
      
      
// Dep
depend () {
  if (Dep.target) {
    Dep.target.addDep(this)
  }
}

addSub (sub: Watcher) {
  // dep.subs
  // 依赖收集观察者
  this.subs.push(sub)
}

// Watcher
addDep (dep: Dep) {
  const id = dep.id
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id)
    // 观察者收集依赖
    this.newDeps.push(dep)
    if (!this.depIds.has(id)) {
      dep.addSub(this)
    }
  }
}
```

数据对应的`dep`在这时就可以就将当前计算中的`watcher`进行收集，而当前的计算中的`watcher`也会对依赖进行收集，如果数据是对象或数组，那么这个数据是一个**响应式对象**，响应式对象的`childOb.dep`需要进行依赖收集，因为有2个种特殊情况不会触发响应式对象的`setter`：

1. 对象的属性添加或移除
2. 数组变动

对象属性的添加或移除比较好理解，那是因为新添加的属性没有进行响应式处理，不能触发它的`setter`，而删除的属性已经被删除，那肯定也不能触发它的`setter`，所以只能对这个添加或删除属性的对象进行“`setter`“，这里的`setter`打了引号，这是因为这里`setter`其实是利用了响应式对象本身的`__ob__.dep`（`childOb.dep`），去通知订阅了它变化的`watcher`更新。

数组变动是通过调用数组变异的方法来触发更新，变异的方法内是通过数组的`__ob__.dep`（`childOb.dep`）通知订阅了它变化的`watcher`更新。

最后如果数据是数组，且数组的元素是响应式对象，需要进行它的`childOb.dep`进行依赖收集。

```javascript
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
```

### 依赖收集后的优化

```javascript
cleanupDeps () {
  let i = this.deps.length
  while (i--) {
    const dep = this.deps[i]
    if (!this.newDepIds.has(dep.id)) {
      // 移除watcher
      dep.removeSub(this)
    }
  }
  let tmp = this.depIds
  this.depIds = this.newDepIds
  this.newDepIds = tmp
  this.newDepIds.clear()
  tmp = this.deps
  this.deps = this.newDeps
  this.newDeps = tmp
  this.newDeps.length = 0
}
```

数据变化会导致重新`_render`，那么就会再次进行依赖收集，如果重新`_render`后，老的数据没有被渲染，那么渲染`watcher`就不需要订阅它们，此时就需要老数据移除收集的`watcher`。

每个数据进行依赖收集的时候，`watcher`会通过`newDepIds`和`newDeps`保存数据对应的`dep.id`和`dep`实例，依赖收集结束后，执行`cleanupDeps`，遍历`watcher`的`deps`，`deps`是保存上一次依赖收集时所有老的`dep`实例，将所有老的`dep.id`和新的`newDepIds`中所有`id`对比，如果不存在，说明这个`dep`对应数据没有被渲染，就会从这个`dep`中移除`watcher`，然后对`depIds`和`deps`进行更新，以备进行下一次依赖收集时进行比对。

举个例子：

```html
<template>
  <div v-if="flag">{{name1}}</div>
  <div v-else>{{name2}}</div>
</template>
```

`flag`为`true`时，组件的渲染`watcher`订阅了`name1`，`flag`为`false`时，组件的渲染`watcher`订阅了`name2`，此时`name1`并没有渲染，那么渲染`watcher`就会从`name1`中被移除。如果没有移除，修改了`name1`，会通知渲染`watcher`去更新，但是最后是不会重新渲染`name1`的，显然这里会造成浪费。

## 派发更新

数据改变，就会触发数据的`setter`：

```javascript
set: function reactiveSetter (newVal) {
  const value = getter ? getter.call(obj) : val
  /* eslint-disable no-self-compare */
  if (newVal === value || (newVal !== newVal && value !== value)) {
    return
  }
  /* eslint-enable no-self-compare */
  if (process.env.NODE_ENV !== 'production' && customSetter) {
    customSetter()
  }
  // #7981: for accessor properties without setter
  if (getter && !setter) return
  if (setter) {
    setter.call(obj, newVal)
  } else {
    val = newVal
  }
  childOb = !shallow && observe(newVal)
  dep.notify()
}
```

派发更新主要有2个步骤：

1. 通知要更新`watcher`，将它们推入到`queue`
2. 异步执行所有`watcher`更新

```javascript
notify () {
  // stabilize the subscriber list first
  const subs = this.subs.slice()
  if (process.env.NODE_ENV !== 'production' && !config.async) {
    // subs aren't sorted in scheduler if not running async
    // we need to sort them now to make sure they fire in correct
    // order
    subs.sort((a, b) => a.id - b.id)
  }
  for (let i = 0, l = subs.length; i < l; i++) {
    subs[i].update()
  }
}

update () {
  /* istanbul ignore else */
  if (this.lazy) {
    this.dirty = true
  } else if (this.sync) {
    this.run()
  } else {
    queueWatcher(this)
  }
}

export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      // `watcher`推入`queue`
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
```

将所有的需要更新的`watcher`，在非更新阶段`push`到`queue`中，并且通过`has[id]`确保相同的`watcher`不会重复`push`，如果是更新阶段，触发了新的`watcher`更新，会找到指定的位置，插入到队列中等待更新。

`nextTick`：

```javascript
const callbacks = []
let pending = false

function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

let timerFunc

if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}


export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
```

`nextTick`就是将所有传入的函数先用匿名函数包装一层，再`push`到`callbcakcs`中，然后去执行`timerFunc`，`timerFunc`会执行`flushCallbacks`，而`timerFunc`的实现是基于异步的，所以`flushCallbacks`执行是异步执行，这样就可以将同一时间内的多次执行`nextTick`时传入的回调函数同步执行。

异步执行的主要目的就是优化，它避免了某个数据多次修改后会多次渲染的问题，同时，当不同数据在同一时间被修改的情况下，订阅了它们变化的`watcher`，如果有重复，不会被重复添加到`queue`这个队列中，进而说明`callbcaks`这个队列中，相同的`watcher`只会被推入一次。

执行`flushCallbacks`，遍历`callbcakcs`并依次执行里面的函数，这时，就会执行先前执行`nextTick`是传入的`flushSchedulerQueue`：

```javascript
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    watcher.run()
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      // ...
    }
  }

  // ...
  resetSchedulerState()
  
  // ...
}
```

遍历`queue`，通过`watcher.run`执行真正的更新：

```javascript
run () {
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

执行`this.get`，就会执行`mountComponent`，就会执行`_render`与`_update`。

更新全部结束后，会执行`resetSchedulerState`：

```javascript
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}
```

这个函数作用就是，重置一些标识，`flushing`在执行`flushSchedulerQueue`被修改为`true`，说明此时`watcher`正在更新，`waiting`是保证同一时间多个数据被修改时`nextTick(flushSchedulerQueue)`只执行一次，也就是`flushSchedulerQueue`只能压入一次异步队列中，当更新全部结束后，这两个标识都会被重置为初始状态，以备下一次数据修改时使用。

