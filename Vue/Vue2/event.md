版本是v2.6.11

元素的事件是通过`v-on`指令去绑定的，其中事件分为原生和自定义，两种事件的区别在于底层使用不同的方式进行绑定，而且自定义事件又只能绑定在组件上，并且自定义事件是父子组件通信的一种重要手段。

### 原生事件

```html
<button v-on:click="clickHandler">点击</button>
```

Vue元素的挂载过程有2个重要阶段，`render`与`patch`，元素绑定事件的时机是在`patch`阶段，这是因为只有当元素被创建后才能进行事件的绑定，而执行绑定的函数就是通过`updateDOMListeners`完成。

这里说明一下，`patch`阶段会执行`invokeCreateHooks`这个函数，它会执行事先存储好的平台相关模块函数，与web平台的相关模块有有事件，类，样式等模块，而`updateDOMListeners`函数就是事件模块中的函数。

```javascript
function add (
  name: string,
  handler: Function,
  capture: boolean,
  passive: boolean
) {
  if (useMicrotaskFix) {
    const attachedTimestamp = currentFlushTimestamp
    const original = handler
    handler = original._wrapper = function (e) {
      if (
        e.target === e.currentTarget ||
        e.timeStamp >= attachedTimestamp ||
        e.timeStamp <= 0 ||
        e.target.ownerDocument !== document
      ) {
        return original.apply(this, arguments)
      }
    }
  }
  target.addEventListener(
    name,
    handler,
    supportsPassive
      ? { capture, passive }
      : capture
  )
}

function updateDOMListeners (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) {
    return
  }
  const on = vnode.data.on || {}
  const oldOn = oldVnode.data.on || {}
  target = vnode.elm
  normalizeEvents(on)
  updateListeners(on, oldOn, add, remove, createOnceHandler, vnode.context)
  target = undefined
}
```

其实，真正的事件绑定是`add`这个函数做的，可以看到，`addEventListener`这个绑定事件的关键方法在`add`函数内部。那么为什么还要通过执行`updateListeners`传入`add`在执行呢，那么我们需要查看一下`updateListeners`函数的内部，源码：

```javascript
export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component
) {
  let name, def, cur, old, event
  for (name in on) {
    def = cur = on[name]
    old = oldOn[name]
    event = normalizeEvent(name)
    // ...
    if (isUndef(cur)) {
      // ...
    } else if (isUndef(old)) {
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur, vm)
      }
      if (isTrue(event.once)) {
        cur = on[name] = createOnceHandler(event.name, cur, event.capture)
      }
      add(event.name, cur, event.capture, event.passive, event.params)
    } else if (cur !== old) {
      // ...
    }
  } 

  // ...
}
```

我们只看主要逻辑，如果没有定义过`cur.fns`，就会通过`createFnInvoker`创建1个`invoker`并将用户定义的事件赋值给`invoker.fns`上，并挂载到`on`对象上，这个`on`对象是`vnode.data.on`，最后，通过`add`函数绑定，这样普通元素的原生事件绑定就算完成了。

### 自定义事件

```html
// 父组件
<div>
   <Dialog @open="openHandler" @click.native="clickHandler" />
   <span>span</span>
</div>


// 子组件 Dialog
<div>dialog</div>
```

```javascript
function createComponent (
  Ctor,
  data,
  context,
  children,
  tag
) {
  // ...

  // 组件的自定义事件
  var listeners = data.on;
  // 组件的原生事件
  data.on = data.nativeOn;

  var vnode = new VNode(
    ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
    data, undefined, undefined, undefined, context,
    // componentOptions
    { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
    asyncFactory
  );

  // ...
}
```

组件的`vnode`在创建的过程中，会将自定义事件挂载到组件的`vnode.componentOptions.listeners`上，而组件的原生事件直接挂载到`data.on`上。

在组件初始化的过程中，会去执行`initInternalComponent`获取父组件`vnode.componentOptions.listeners`，挂载到组件实例的`$options`上，这里的父组件`vnode`是指`Dialog`对应的`vnode`。

```javascript
function initInternalComponent (vm, options) {
  var opts = vm.$options = Object.create(vm.constructor.options);
  const parentVnode = options._parentVnode
  // ...
  const vnodeComponentOptions = parentVnode.componentOptions
  // ...
  opts._parentListeners = vnodeComponentOptions.listeners;
  // ...
}
```

然后还会去执行`initEvents`，去绑定自定义事件，源码：

```javascript
function initEvents (vm) {
  vm._events = Object.create(null);
  vm._hasHookEvent = false;
  // init parent attached events
  var listeners = vm.$options._parentListeners;
  if (listeners) {
    updateComponentListeners(vm, listeners);
  }
}
```

这里我们拿到了，父组件`vnode`传过来的`listeners`，然后通过执行`updateComponentListeners`进行自定事件的绑定，源码：

```javascript
function updateComponentListeners (
  vm,
  listeners,
  oldListeners
) {
  target = vm;
  updateListeners(listeners, oldListeners || {}, add, remove$1, createOnceHandler, vm);
  target = undefined;
}

function add (event, fn) {
  target.$on(event, fn)
}
```

`updateComponentListeners`内部也是调用`updateListeners`进行绑定，和原生事件不同的是参数，`add`函数的实现，组件调用`$on`方法进行绑定。

```javascript
export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
```

非常经典的事件中心的实现，把所有的事件用 `vm._events` 存储起来。

`$on` 方法，按事件的名称 `event` 把回调函数 `fn` 存储起来 。

`$emit`方法，根据事件名 `event` 找到所有的回调函数，然后遍历执行所有的回调函数。

`$off` 方法，移除指定事件名 `event` 和指定的 `fn` 。

`$once` 方法，内部就是执行 `vm.$on`，当回调函数执行一次后，通过 `$off` 移除，这样就确保了回调函数只执行一次。

最后，组件的原生事件是什么时候绑定的呢？我们知道，组件是一层抽象，它不会被真正的渲染到页面上，而组件的根节点会渲染到页面上，那么注册在组件上的原生事件就会绑定在组件的根节点上，当组件`patch`完毕后，会执行`initComponent`函数，这个函数内部会执行`invokeCreateHooks`函数，将组件上的原生事件绑定到组件的根节点上。

### 总结

注册在组件上的事件函数，是在父组件中定义的，它会被保存到子组件实例上的`_events`中，子组件通过`$emit`触发`_events`中指定的事件，这样就形成了父子组件通讯。