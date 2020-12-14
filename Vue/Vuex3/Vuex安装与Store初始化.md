Vuex版本为3.5.1

### Vuex安装

使用Vuex的第一步，通过执行`Vue.use`安装，`use`方法内部执行的是插件`install`方法：

```javascript
export function install(_Vue) {
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        "[vuex] already installed. Vue.use(Vuex) should be called only once."
      )
    }
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
```

这是`vuex`内部提供的`install`方法，它直接执行的是`applyMixin`：

```javascript
export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */

  function vuexInit () {
    const options = this.$options
    // store injection
    if (options.store) {
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}
```

可以看出，`applyMixin`方法内部使用`Vue.mixin`全局混入了`beforeCreate`钩子函数，这个函数的实现是，判断选项上是否含有`store`选项，如果有，说明该组件是根组件，因为我们只会在根组件上注册`store`，直接将`store`挂载到根组件的`$store`属性上；如果没有，说明该组件是子组件，获取父组件的`$sotre`，并挂载到子组件的`$store`属性上。由于每个组件在初始化的过程中都会执行`beforeCreate`钩子函数，这样就保证了每个组件实例上都有可以访问`store`实例。

### Store初始化

使用Vuex的第二步，就是`new Store`，`Store`的构造函数：

```javascript
export class Store {
  constructor(options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== "undefined" && window.Vue) {
      install(window.Vue)
    }

    if (__DEV__) {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(
        typeof Promise !== "undefined",
        `vuex requires a Promise polyfill in this browser.`
      )
      assert(
        this instanceof Store,
        `store must be called with the new operator.`
      )
    }

    const { plugins = [], strict = false } = options

    // store internal state
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    // 初始化模块
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []
    this._watcherVM = new Vue()
    this._makeLocalGettersCache = Object.create(null)

    // bind commit and dispatch to self
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit(type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict

    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    // 安装模块
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    // 初始化store._vm
    resetStoreVM(this, state)

    // apply plugins
    plugins.forEach((plugin) => plugin(this))

    const useDevtools =
      options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }
}
```

比较关键的三步：

1. 初始化模块，构建模块树
2. 安装模块，初始化所有模块的`state`，`getter`，`mutation`，`action`
3. 初始化`store._vm`，`state`转化为响应式，建立`state`和`getter`关系

#### 初始化模块集合（树）

```javascript
export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  getNamespace (path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update (rawRootModule) {}

  register (path, rawModule, runtime = true) {
    if (__DEV__) {
      assertRawModule(path, rawModule)
    }

    const newModule = new Module(rawModule, runtime)
    if (path.length === 0) {
      this.root = newModule
    } else {
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  unregister (path) {}

  isRegistered (path) {}
}
```

初始化模块集合，执行的是`register`，`register`首先通过`new Module`初始化模块，然后根据`path`来构建模块的关系，最后，如果模块有子模块，遍历子模块，递归执行`register`。

`Module`源码：

```javascript
export default class Module {
  constructor (rawModule, runtime) {
    this.runtime = runtime
    // Store some children item
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule
    const rawState = rawModule.state

    // Store the origin module's state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  get namespaced () {
    return !!this._rawModule.namespaced
  }

  addChild (key, module) {
    this._children[key] = module
  }

  removeChild (key) {
    delete this._children[key]
  }

  getChild (key) {
    return this._children[key]
  }

  hasChild (key) {
    return key in this._children
  }

  update (rawModule) {}

  forEachChild (fn) {}

  forEachGetter (fn) {}

  forEachAction (fn) {}

  forEachMutation (fn) {}
}
```

初始化模块，可以看到，模块的初始化就是，就是初始化模块上的一些属性，其中`_children`是存放子模块的数组，`_rawModule`存放模块的配置，最后是`state`。

回到`register`，会通过`path`构建属性关系，`path`是存储模块对应的`key`，模块安装整个过程的重要依赖。第一次执行`register`的时候，也就是在执行`new ModuleCollection`的时候，传入的`path`是一个空数组，所以此时注册的模块就是根模块，递归执行`regiser`的时候，`path`会合并遍历后模块的`key`，这样`path.length`将大于`0`，命中`else`逻辑：

```javascript
else {
  const parent = this.get(path.slice(0, -1))
  parent.addChild(path[path.length - 1], newModule)
}

get (path) {
  return path.reduce((module, key) => {
    return module.getChild(key)
  }, this.root)
}
```

`path.slice(0, -1)`是截取掉最后一位元素，因为此时`path`最后一位元素是当前模块的`key`，截取后的`path`传入到`get`方法内，就会一层一层向下遍历，直到`path`的最后一位：当前模块的父模块，将当前模块存放到父模块的`_children`中。

当所有的模块初始化完毕后，模块树就形成了。

#### 模块安装

```javascript
function installModule(store, rootState, path, module, hot) {
  const isRoot = !path.length
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(
        `[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join(
          "/"
        )}`
      )
    }
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  // 构建state
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      if (__DEV__) {
        // ...
      }
      Vue.set(parentState, moduleName, module.state)
    })
  }

  const local = (module.context = makeLocalContext(store, namespace, path))

  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })
    
  module.forEachChild((child, key) => {
    // 子模块递归安装
    // 注意path会合并当前模块的 key
    installModule(store, rootState, path.concat(key), child, hot)
  })
}
```

模块的安装，先判断当前模块是否为根模块，然后根据`path`获取当前模块的`namespace`，然后，在模块配置了`namespaced`为`true`的情况下，会在`store_modulesNamespaceMap`注册以`namespace`为`key`的模块映射，这个映射在`mapState`， `mapMutations`， `mapGetters`， `mapActions`中用到。

初始化`state`，在不是根模块的情况下，先通过`getNestedState`获取父模块的`state`，在获取当前的模块名`moduleName`，最后通过`Vue.set`将当前模块的`state`挂载到父模块`state`上，模块的安装会遍历子模块，递归执行模块的安装，这样就可以构建各个模块`state`之间的关系。

初始化本地模块上下文`local`，源码：

```javascript
function makeLocalContext(store, namespace, path) {
  const noNamespace = namespace === ""

  const local = {
    dispatch: noNamespace
      ? store.dispatch
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options)
          const { payload, options } = args
          let { type } = args

          if (!options || !options.root) {
            type = namespace + type
            if (__DEV__ && !store._actions[type]) {
              console.error(
                `[vuex] unknown local action type: ${args.type}, global type: ${type}`
              )
              return
            }
          }

          return store.dispatch(type, payload)
        },

    commit: noNamespace
      ? store.commit
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options)
          const { payload, options } = args
          let { type } = args

          if (!options || !options.root) {
            type = namespace + type
            if (__DEV__ && !store._mutations[type]) {
              console.error(
                `[vuex] unknown local mutation type: ${args.type}, global type: ${type}`
              )
              return
            }
          }

          store.commit(type, payload, options)
        },
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace),
    },
    state: {
      get: () => getNestedState(store.state, path),
    },
  })

  return local
}
```

初始化`local`对象，`dispatch`和`commit`，这2个方法的主要作用是，包装了`sotre`实例上的`dispatch`和`commit`，其主要目的就是，配置了命名空间的情况下，会将`type`拼接上命名空间，这样在当前模块配置的`action`中，可以直接调用当前的模块内的`action`和`commit`。

`getters`在配置了命名空间的情况下，它的`getter`是`() => makeLocalGetters(store, namespace)`，源码：

```javascript
function makeLocalGetters(store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    // moduleA
    const splitPos = namespace.length
    Object.keys(store.getters).forEach((type) => {
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true,
      })
    })
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}
```

首先，初始化`gettersProxy`代理对象，遍历`store`实例上的`getters`，通过`type`和`namesapce`匹配，`type`是`getter`的`key`，`namespace`是模块的`key`，如果截取后的`type`和`namespace`相等，说明这个`getter`是当前模块内的`getter`。然后，提取当前`getter`的`localType`，将它挂载到`gettersProxy`代理对象，并设置它的`getter`，最后将这个对象缓存起来。

`gettersProxy`代理对象，是在模块配置了命名空间的情况下，才会被初始化，它是代理单个模块上所有`getter`的对象。

首次访问某个模块内的某个`getter`会初始化这个`gettersProxy`，将当前模块的所有`getter`挂载到这个代理对象上，当再次访问该模块的其他`getter`就会直接从`_makeLocalGettersCache`中获取这个代理对象。

`state`，是通过`getNestedState`获取，源码：

```javascript
function getNestedState(state, path) {
  return path.reduce((state, key) => state[key], state)
}
```

`state`的获取很简单，一层层查找子模块 `state`，最终找到目标模块的 `state`。

回到`installModule`，初始化模块的`mutation`。

```javascript
module.forEachMutation((mutation, key) => {
  const namespacedType = namespace + key
  registerMutation(store, namespacedType, mutation, local)
})

function registerMutation(store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = [])
  entry.push(function wrappedMutationHandler(payload) {
    handler.call(store, local.state, payload)
  })
}
```

遍历模块的`mutation`，通过`registerMutation`在`store._mutations`上初始对应的`type`数组，将包装`mutation`的函数`wrappedMutationHandler`压入其中。`handler`就是用户配置的`mutation`，它的第1个参数，就是当前模块的`state`。

初始化`action`

```javascript
module.forEachAction((action, key) => {
  const type = action.root ? key : namespace + key
  const handler = action.handler || action
  registerAction(store, type, handler, local)
})

function registerAction(store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler(payload) {
    let res = handler.call(
      store,
      {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state,
      },
      payload
    )
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch((err) => {
        store._devtoolHook.emit("vuex:error", err)
        throw err
      })
    } else {
      return res
    }
  })
}
```

`action`的初始化和`mutation`几乎相同，在`store._actions`初始化对应的`type`数组，将`action`的包装函数压入其中。

初始化`getters`

```javascript
module.forEachGetter((getter, key) => {
  const namespacedType = namespace + key
  registerGetter(store, namespacedType, getter, local)
})

function registerGetter(store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter(store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}
```

和上面2个几乎相同的逻辑，唯一不同的点是，`getter`的包装函数，不是存放在数组上，而是存放到1个对象上，那么如果2个模块都没有设置命名空间且有相同的`getter`属性名的情况下，就会报错。

安装模块的最后一步就是遍历子模块递归执行`installModule`。

####　初始化`store._vm`

```javascript
function resetStoreVM(store, state, hot) {
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null)
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    computed[key] = partial(fn, store)
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true, // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  Vue.config.silent = true
  store._vm = new Vue({
    data: {
      $$state: state,
    },
    computed,
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  if (store.strict) {
    enableStrictMode(store)
  }

  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}
```

分别初始化`store.getters`和`computed`，遍历`wrappedGetters`获取对应的`fn`以及`key`，向`computed`和`store.gettersg`挂载新属性，通过`new Vue`的方式，将`state`转化为响应式，并初始化了计算属性`computed`，并将实例挂载到`store._vm`上。

```javascript
Object.defineProperty(store.getters, key, {
  get: () => store._vm[key],
  enumerable: true, // for local getters
})
```

上面这段代码，是建立`state`与`getter`关联逻辑，当我们根据`key`访问`store.getters`上的某个`getter`时，就会访问`store._vm[key]`，也就是`computed[key]`，这是因为计算属性初始化后，都会被挂载到组件的实例上，而`computed[key]`的`getter`是通过执行`fn(arg)`的返回函数`rawGetter`，在执行`rawGetter`时会访问`state`，进而访问到 `store._vm._data.$$state`，这样就建立起`getter`与`state`的依赖。 

```javascript
export class Store {
    get state() {
      return this._vm._data.$$state
    }
}
```

严格模式下，Vuex内部可以检测`state`改变方式。

```javascript
if (store.strict) {
  enableStrictMode(store)
}

function enableStrictMode(store) {
  store._vm.$watch(
    function () {
      return this._data.$$state
    },
    () => {
      if (__DEV__) {
        assert(
          store._committing,
          `do not mutate vuex store state outside mutation handlers.`
        )
      }
    },
    { deep: true, sync: true }
  )
}
```

在初始化`store._vm`的过程中，如果配置了`store.strict`，会执行`enableStrictMode`函数，对`$$state`进行侦听，当`$$state`修改的时候，`store._committing`为`false`的话，就会报错。

我们知道，`state`改变的方式只能通过`mutation`，而触发`mutation`是通过`commit`，`commit`是`store`上的原型方法，源码：

```javascript
commit(_type, _payload, _options) {
  // check object-style commit
  const { type, payload, options } = unifyObjectStyle(
    _type,
    _payload,
    _options
  )

  const mutation = { type, payload }
  
  // 获取对应的muation
  const entry = this._mutations[type]
  if (!entry) {
    if (__DEV__) {
      console.error(`[vuex] unknown mutation type: ${type}`)
    }
    return
  }
    
  // 执行mutation
  this._withCommit(() => {
    entry.forEach(function commitIterator(handler) {
      handler(payload)
    })
  })

  this._subscribers
    .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
    .forEach((sub) => sub(mutation, this.state))

  if (__DEV__ && options && options.silent) {
    console.warn(
      `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        "Use the filter functionality in the vue-devtools"
    )
  }
}
```

`commit`方法很简单，根据`type`获取`store._mutations`中对应的`mutation`，通过`_withCommit`执行`mutation`，源码：

```javascript
_withCommit(fn) {
  const committing = this._committing
  this._committing = true
  fn()
  this._committing = committing
}
```

`_withCommit`方法也是`store`原型上的，可以看到，我们在执行回调的时候，会先将`store._committing`重置为`true`，在执行完毕，恢复为重置前的`_committing`。

所以，当`state`被`commit`提交的`mutation`改变时，不会报错，而外部直接修改`state`时，会报错。

### 总结

- 插件安装，全局混入`beforeCreate`，在每个组件实例上挂载`store`

- `new Store`

  1. 初始化模块集合，构建模块树

  2. 安装模块

     - 初始化命名空间映射`_modulesNamespaceMap`
     - 初始化模块`state`，根据模块层级关系，建立`state`树

     - 初始化模块上下文，包装`store`的`commit`和`dispatch`方法，设置`state`和`getter`的`getter`方法
     - 初始化模块`mutation`，向`store._mutations`保存所有的`wrappedMutationHandler`
     - 初始化模块`action`，向`store._acions`保存所有的`wrappedActionHandler`
     - 初始化模块`getter`，向`store._wrappedGetters`保存所有的`wrappedGetter`

  3. 初始化`store._vm`
     - 初始化`getters`，建立`state`与`getter`关联
     
     - 通过`new Vue`方式，初始化`state`与`computed`

