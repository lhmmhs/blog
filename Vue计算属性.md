版本是v2.6.11

Vue计算属性是依赖于数据的，当数据变化时，计算属性也会随之变化，模板中有多个相同的计算属性时，在访问它们的时候，第一次访问时会计算返回值并缓存这个结果，剩余的访问过程直接返回缓存的结果。

计算属性想要随数据变化而变化，那就需要被数据进行依赖收集。

## 计算属性初始化

计算属性的初始化，和数据的初始化都是在`instate`发生的，

```javascript
export function initState(vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  // 初始化计算属性
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
```

```javascript
const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    // ...

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }
      
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // ...
    }
  }
}
```

在组件的实例上添加`_computedWatchers`属性，作用是存储所有的`computed watcher`，遍历`computed`，获取每个计算属性的`getter`，并为每个计算属性实例化为对应的`computed watcher`，从这里可以看出：计算属性本质是一个`watcher`。最后，判断计算属性不存在于实例上，进行`defineComputed`处理，如果存在，说明该计算属性，已经被初始化过了。

实例化`computed watcher`：

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
  vm._watchers.push(this)
  // options
  if (options) {
    // ...
    this.lazy = !!options.lazy
    // ...
  } else {
    // ...
  }
  // ...
    
  if (typeof expOrFn === 'function') {
    this.getter = expOrFn
  } else {
    // ...
  }    

  this.value = this.lazy
    ? undefined
    : this.get()
}
```

实例化`computed watcher`时，由于`computed watcher`的`lazy`属性是`true`，不会立刻执行`this.get`进行求值。

回到`initComputed`，执行`defineComputed`

```javascript
export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter(key) {
  return function computedGetter() {
     // ...
  }
}
```

`defineComputed`将`computed`挂载到组件的实例上，并设置它的`getter/setter`，`getter`是由`createComputedGetter`创建的，而`setter`是用户定义的`setter`，如果没定义就设置为`noop`空函数。

### 组件计算属性初始化

大部分情况下，计算属性都是组件内配置的，组件的计算属性初始化的时机和上面不同，是在构造组件构造函数时，被初始化。

```javascript
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }
  // ...

  return vnode
}

Vue.extend = function (extendOptions: Object): Function {
  // ...
    
  if (Sub.options.computed) {
    initComputed(Sub)
  }
    
  // ...
  return Sub
}

function initComputed(Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
```

组件计算属性最终被挂载到组件构造函数的原型上。

## 计算属性被依赖收集

计算属性被访问时，会触发它的`getter`：

```javascript
return function computedGetter() {
  const watcher = this._computedWatchers && this._computedWatchers[key]
  if (watcher) {
    if (watcher.dirty) {
      watcher.evaluate()
    }
    if (Dep.target) {
      watcher.depend()
    }
    return watcher.value
  }
}
```

通过`_computedWatchers`获取对应的`computed watcher`，判断它的`dirty`，`dirty`表示当前`computed watcher`是否计算过，如果没计算过，执行`evaluate`进行计算，否则，会直接返回`watcher.value`，这里就是为什么多次访问同一个计算属性会返回之前的计算结果。

```javascript
evaluate() {
  this.value = this.get()
  this.dirty = false
}

get() {
  pushTarget(this)
  let value
  const vm = this.vm
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    // ...
  } finally {
    // ...
  }
  return value
}

export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}
```

执行`evaluate`的过程中，会将全局`Dep.target`更新为`computed watcher`，此时，执行`computed watcher`的`getter`，这个`getter`就是用户定义的计算属性，`getter`内，**会访问到依赖的数据，从而触发这个数据的`getter`，进行依赖收集把当前的`Dep.target`收集起来**，收集完毕后，将计算属性的结果缓存到`watcher.value`中，并设置`this.dirty`为`false`，如果再次访问这个计算属性，就不会进行计算，而是直接返回这个缓存的值。

```javascript
if (Dep.target) {
  watcher.depend()
}

depend() {  
  let i = this.deps.length
  while (i--) {
    this.deps[i].depend()
  }
}

depend() {
  if (Dep.target) {
    Dep.target.addDep(this)
  }
}

addDep(dep: Dep) {
  const id = dep.id
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id)
    this.newDeps.push(dep)
    if (!this.depIds.has(id)) {
      dep.addSub(this)
    }
  }
}
```

如果计算属性依赖的数据没有在模板中声明，那么该数据是没有收集到渲染`watcher`的。在被依赖的数据收集到`computed watcher`后，会执行`computed watcher`的`depend`去遍历自身的`dep`，将收集自身但是没有收集渲染`watcher`的`dep`对渲染`watcher`进行收集。

## 计算属性被“派发更新”

当数据修改的时候，就会通知它收集的`watcher`更新：

```javascript
update() {
  if (this.lazy) {
    this.dirty = true
  } else if (this.sync) {
    this.run()
  } else {
    queueWatcher(this)
  }
}
```

标题中的**派发更新**使用了引号，这时因为`computed watcher`在派发更新的过程中，没有被推入到异步更新的队列中，而是将它的`dirty`重置为`true`。

渲染`watcher`更新的过程中，会执行`render`，从而触发计算属性的`getter`，

```javascript
return function computedGetter() {
  const watcher = this._computedWatchers && this._computedWatchers[key]
  if (watcher) {
    if (watcher.dirty) {
      watcher.evaluate()
    }
    if (Dep.target) {
      watcher.depend()
    }
    return watcher.value
  }
}
```

此时，`dirty`已经被重置为`true`，就会重新进行计算。