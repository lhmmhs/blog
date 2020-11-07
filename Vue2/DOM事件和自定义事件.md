版本是v2.6.11

`Vue2.x`有原生DOM事件和自定义事件，其中，原生DOM事件即可以在普通元素节上绑定，也可以在组件上绑定，而自定义事件只能绑定在组件节点上。并且自定义事件只能通过`$emit `触发。

根据案例走流程，就可以清晰的看到原生DOM事件和自定义事件是如何绑定的。

```javascript
let Child = {
  template: '<button @click="clickHandler($event)">' +
    'click me' +
    '</button>',
  methods: {
    clickHandler(e) {
      console.log('Button clicked!', e)
      this.$emit('select')
    }
  }
}

let vm = new Vue({
  el: '#app',
  template: '<div>' +
    '<child @select="selectHandler" @click.native.prevent="clickHandler"></child>' +
    '</div>',
  methods: {
    clickHandler() {
      console.log('Child clicked!')
    },
    selectHandler() {
      console.log('Child select!')
    }
  },
  components: {
    Child
  }
})
```

### 编译

在`parse`阶段会通过`processAttrs`函数处理元素节点的属性：

```javascript
function processAttrs (el) {
  var list = el.attrsList;
  var i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true;
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, ''));
      // support .foo shorthand syntax for the .prop modifier
      if (modifiers) {
        name = name.replace(modifierRE, '');
      }
      if (bindRE.test(name)) { // v-bind
        // ...
      } else if (onRE.test(name)) { // v-on
        name = name.replace(onRE, '');
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }
        addHandler(el, name, value, modifiers, false, warn$2, list[i], isDynamic);
      } else { // normal directives
        // ..
      }
    } else {
      // ...
    }
  }
}
```

只展示与事件属性有关的逻辑，获取属性`name`，解析`name`中包含的`modifiers`修饰符，通过`addHandler`添加属性，源码：

```javascript
function addHandler (
  el,
  name,
  value,
  modifiers,
  important,
  warn,
  range,
  dynamic
) {
  modifiers = modifiers || emptyObject;
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    );
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  if (modifiers.right) {
    if (dynamic) {
      name = "(" + name + ")==='click'?'contextmenu':(" + name + ")";
    } else if (name === 'click') {
      name = 'contextmenu';
      delete modifiers.right;
    }
  } else if (modifiers.middle) {
    if (dynamic) {
      name = "(" + name + ")==='click'?'mouseup':(" + name + ")";
    } else if (name === 'click') {
      name = 'mouseup';
    }
  }

  // check capture modifier
  if (modifiers.capture) {
    delete modifiers.capture;
    name = prependModifierMarker('!', name, dynamic);
  }
  if (modifiers.once) {
    delete modifiers.once;
    name = prependModifierMarker('~', name, dynamic);
  }
  /* istanbul ignore if */
  if (modifiers.passive) {
    delete modifiers.passive;
    name = prependModifierMarker('&', name, dynamic);
  }

  var events;
  
  if (modifiers.native) {
    // 原生
    delete modifiers.native;
    events = el.nativeEvents || (el.nativeEvents = {});
  } else {
    // 自定义
    events = el.events || (el.events = {});
  }

  var newHandler = rangeSetItem({ value: value.trim(), dynamic: dynamic }, range);
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers;
  }

  
  var handlers = events[name];
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler);
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler];
  } else {
    events[name] = newHandler;
  }

  el.plain = false;
}
```

函数看起来很长，大部分都是根据修饰符处理`name`，然后根据`modifiers.native`区分事件是原生还是自定义，最后将事件的`handler`保存到对应的事件中。

案例中的`child`节点生成的 `el.events` 和 `el.nativeEvents` 如下：

```javascript
el.events = {
  select: {
    dynamic: false
	end: 35
	start: 12
	value: "selectHandler"
  }
}

el.nativeEvents = {
  click: {
    dynamic: false
    end: 72
    modifiers: {prevent: true}
    start: 36
    value: "clickHandler"
  }
}
```

组件中的`button`节点生成的 `el.events` 如下：

```javascript
el.events = {
  click: {
    dynamic: false
    end: 37
    start: 8
    value: "clickHandler($event)"
  }
}
```

在`generate`阶段，会在`genData`阶段执行`genHandlers`处理事件，源码：

```javascript
function genData$2 (el, state) {
  var data = '{';

  // ...
    
  // event handlers
  if (el.events) {
    data += (genHandlers(el.events, false)) + ",";
  }
  if (el.nativeEvents) {
    data += (genHandlers(el.nativeEvents, true)) + ",";
  }
  // ...

  return data
}
```

只保留了关键逻辑，原生事件和自定义事件都是通过`genHandlers`处理，不同之处就是传入的第二个参数分别是`true`和`false`。

```javascript
function genHandlers (
  events,
  isNative
) {
  var prefix = isNative ? 'nativeOn:' : 'on:';
  var staticHandlers = "";
  var dynamicHandlers = "";
  for (var name in events) {
    var handlerCode = genHandler(events[name]);
    if (events[name] && events[name].dynamic) {
      dynamicHandlers += name + "," + handlerCode + ",";
    } else {
      staticHandlers += "\"" + name + "\":" + handlerCode + ",";
    }
  }
  staticHandlers = "{" + (staticHandlers.slice(0, -1)) + "}";
  if (dynamicHandlers) {
    return prefix + "_d(" + staticHandlers + ",[" + (dynamicHandlers.slice(0, -1)) + "])"
  } else {
    return prefix + staticHandlers
  }
}
```
`genHandlers`会依据传入的`isNative`设置不同的`prefix`，然后遍历事件通过`genHandler`处理事件的`handler`。


```javascript
function genHandler (handler) {
  if (!handler) {
    return 'function(){}'
  }

  if (Array.isArray(handler)) {
    return ("[" + (handler.map(function (handler) { return genHandler(handler); }).join(',')) + "]")
  }
	
    
  // 是否为函数名 
  var isMethodPath = simplePathRE.test(handler.value);
  // 是否为函数表达式
  // () => {}
  // function() {}
  var isFunctionExpression = fnExpRE.test(handler.value);
  // 是否为函数调用
  var isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, ''));

  if (!handler.modifiers) {
    // 函数名
    // 函数表达式
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    // 函数表达式
    // 内联语句
    return ("function($event){" + (isFunctionInvocation ? ("return " + (handler.value)) : handler.value) + "}") // inline statement
  } else {
    var code = '';
    var genModifierCode = '';
    var keys = [];
    for (var key in handler.modifiers) {
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key];
        // left/right
        if (keyCodes[key]) {
          keys.push(key);
        }
      } else if (key === 'exact') {
        var modifiers = (handler.modifiers);
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(function (keyModifier) { return !modifiers[keyModifier]; })
            .map(function (keyModifier) { return ("$event." + keyModifier + "Key"); })
            .join('||')
        );
      } else {
        keys.push(key);
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys);
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    if (genModifierCode) {
      code += genModifierCode;
    }
    var handlerCode = isMethodPath
      ? ("return " + (handler.value) + "($event)")
      : isFunctionExpression
        ? ("return (" + (handler.value) + ")($event)")
        : isFunctionInvocation
          ? ("return " + (handler.value))
          : handler.value;
    return ("function($event){" + code + handlerCode + "}")
  }
}
```

`genHandler`先处理`handler.value`，有以下几种情况：

1. 是函数名
2. 是函数表达式
3. 是函数调用
4. 内联语句

没有修饰符的情况下，如果是函数名或函数表达式，则直接返回`handler.value`的值，否则都会被包装一层在返回。

案例中的`child`组件绑定的事件都是函数名，但是`click`事件有修饰符，不会被直接返回，而`select`事件会直接被返回。

组件内的`button`节点是函数调用，所以它会被包装一层后被返回。

有修饰符的情况下，去处理修饰符并更新`code`，最后会被包装一层返回。

`child`组件绑定的`click`事件有`prevent`修饰符，它会添加对应的代码，最后被包装返回。

处理完后的父组件生成的`data`：

```javascript
{
  on: {"select": selectHandler},
  nativeOn: {"click": function($event) {
      $event.preventDefault();
      return clickHandler($event)
    }
  }
}
```

子组件生成的 `data`：

```javascript
{
  on: {"click": function($event) {
      return clickHandler($event)
    }
  }
}
```

### 运行时

父组件`render`阶段，生成组件`vnode`是通过 `createComponent` 完成的， 源码：

```javascript
function createComponent (
  Ctor,
  data,
  context,
  children,
  tag
) {
  // ...



  data = data || {};


  // 组件的自定义事件
  // 注意：如果不是组件，这里代表的是原生事件
  var listeners = data.on;
  // 组件的原生事件
  data.on = data.nativeOn;


  // return a placeholder vnode
  var name = Ctor.options.name || tag;
  var vnode = new VNode(
    ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
    data, undefined, undefined, undefined, context,
    { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
    asyncFactory
  );

  return vnode
}
```

这个过程可以看出，组件的自定义事件被保存在`vnode.componentOptions`上，而原生DOM事件被保存在`data.on`上。

父组件`patch`阶段，`vnode`是组件`vnode`的情况下，会执行`crateComponent`，源码：

```javascript
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
  var i = vnode.data;
  if (isDef(i)) {
    var isReactivated = isDef(vnode.componentInstance) && i.keepAlive;
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      i(vnode, false /* hydrating */);
    }
    // after calling the init hook, if the vnode is a child component
    // it should've created a child instance and mounted it. the child
    // component also has set the placeholder vnode's elm.
    // in that case we can just return the element and be done.
    if (isDef(vnode.componentInstance)) {
      initComponent(vnode, insertedVnodeQueue);
      insert(parentElm, vnode.elm, refElm);
      if (isTrue(isReactivated)) {
        reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm);
      }
      return true
    }
  }
}
```

`crateComponet`会执行安装过的组件`hook` `init`，

```javascript
var componentVNodeHooks = {
  init: function init (vnode, hydrating) {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      var mountedNode = vnode; // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      var child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      );
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  },

  prepatch: function prepatch (oldVnode, vnode) {},

  insert: function insert (vnode) {},

  destroy: function destroy (vnode) {}
};

function createComponentInstanceForVnode (
  vnode, // we know it's MountedComponentVNode but flow doesn't
  parent // activeInstance in lifecycle state
) {
  var options = {
    _isComponent: true,
    _parentVnode: vnode,
    parent: parent
  };
  // check inline-template render functions
  var inlineTemplate = vnode.data.inlineTemplate;
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render;
    options.staticRenderFns = inlineTemplate.staticRenderFns;
  }
  // 继承的构造函数
  return new vnode.componentOptions.Ctor(options)
}
```

`hook` `init`内部执行`createComponentInstanceForVnode`就会去执行继承的构造函数：

```javascript
Vue.prototype._init = function (options) {
    
  // ...

  if (options && options._isComponent) {
    initInternalComponent(vm, options);
  } else {
    // ...
  }
  
  // ...
    
  initEvents(vm);
    
  // ...
  
};


function initInternalComponent (vm, options) {
  var opts = vm.$options = Object.create(vm.constructor.options);
  // ...
  opts._parentListeners = vnodeComponentOptions.listeners;
  // ...
}
```

首先通过`initInternalComponent`将组件`vnode.componentOptions`的`listeners`保存到组件实例的`$options`上，然后通过`initEvents`初始化事件。

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

function updateComponentListeners (
  vm,
  listeners,
  oldListeners
) {
  target = vm;
  updateListeners(listeners, oldListeners || {}, add, remove$1, createOnceHandler, vm);
  target = undefined;
}
```

`initEvents`获取组件实例上的`listeners`，执行`updateComponentListeners`，进而执行`updateListeners`，

```javascript
function updateListeners (
  on,
  oldOn,
  add,
  remove$$1,
  createOnceHandler,
  vm
) {
  var name, def$$1, cur, old, event;
  for (name in on) {
    def$$1 = cur = on[name];
    old = oldOn[name];
    event = normalizeEvent(name);
    if (isUndef(cur)) {
      warn(
        "Invalid handler for event \"" + (event.name) + "\": got " + String(cur),
        vm
      );
    } else if (isUndef(old)) {
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur, vm);
      }
      if (isTrue(event.once)) {
        cur = on[name] = createOnceHandler(event.name, cur, event.capture);
      }
      add(event.name, cur, event.capture, event.passive, event.params);
    } else if (cur !== old) {
      old.fns = cur;
      on[name] = old;
    }
  }
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name);
      remove$$1(event.name, oldOn[name], event.capture);
    }
  }
}
```

比较关键的2步：

1. 执行`createFnInvoker`创建回调函数，自定义事件函数
2. 执行`add`添加，对于原生DOM事件和自定义事件`add`实现是不同的

根据流程现在处理的是组件自定义事件，那么`add`的源码：

```javascript
function add (event, fn) {
  target.$on(event, fn);
}
```

实际上是利用`Vue`的事件中心：

```javascript
function eventsMixin (Vue) {
  var hookRE = /^hook:/;
  Vue.prototype.$on = function (event, fn) {
    var vm = this;
    if (Array.isArray(event)) {
      for (var i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn);
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn);
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true;
      }
    }
    return vm
  };

  Vue.prototype.$once = function (event, fn) {
    var vm = this;
    function on () {
      vm.$off(event, on);
      fn.apply(vm, arguments);
    }
    on.fn = fn;
    vm.$on(event, on);
    return vm
  };

  Vue.prototype.$off = function (event, fn) {
    var vm = this;
    // all
    if (!arguments.length) {
      vm._events = Object.create(null);
      return vm
    }
    // array of events
    if (Array.isArray(event)) {
      for (var i$1 = 0, l = event.length; i$1 < l; i$1++) {
        vm.$off(event[i$1], fn);
      }
      return vm
    }
    // specific event
    var cbs = vm._events[event];
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event] = null;
      return vm
    }
    // specific handler
    var cb;
    var i = cbs.length;
    while (i--) {
      cb = cbs[i];
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1);
        break
      }
    }
    return vm
  };

  Vue.prototype.$emit = function (event) {
    var vm = this;
    {
      var lowerCaseEvent = event.toLowerCase();
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          "Event \"" + lowerCaseEvent + "\" is emitted in component " +
          (formatComponentName(vm)) + " but the handler is registered for \"" + event + "\". " +
          "Note that HTML attributes are case-insensitive and you cannot use " +
          "v-on to listen to camelCase events when using in-DOM templates. " +
          "You should probably use \"" + (hyphenate(event)) + "\" instead of \"" + event + "\"."
        );
      }
    }
    var cbs = vm._events[event];
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs;
      var args = toArray(arguments, 1);
      var info = "event handler for \"" + event + "\"";
      for (var i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info);
      }
    }
    return vm
  };
}
```

可以看到，`$on`方法内部，会在实例上挂载`_events`属性，它的作用就是存储组件绑定的所有自定义事件，而`$emit`方法就是根据传入的`event`从`_events`找到对应的回调函数并执行。

到这里，组件的自定义事件算是绑定完成。

子组件在`patch`阶段，会执行`invokeCreateHooks`，DOM元素的相关属性，class，style，都是在这里完成设置的，我们只看有关事件的函数`updateDOMListeners`：

```javascript
function updateDOMListeners (oldVnode, vnode) {
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) {
    return
  }
  var on = vnode.data.on || {};
  var oldOn = oldVnode.data.on || {};
  // 被绑定的真实dom引用
  target$1 = vnode.elm;
  normalizeEvents(on);
  updateListeners(on, oldOn, add$1, remove$2, createOnceHandler$1, vnode.context);
  target$1 = undefined;
}
```

内部也是通过执行`updateListeners`来进行事件绑定的，也就是说先通过`createFnInvoker`生成回调函数，在通过`add`函数绑定。但是，这次`add`函数和上一次绑自定义事件时不同：

```javascript
function add$1 (
  name,
  handler,
  capture,
  passive
) {
  // async edge case #6566: inner click event triggers patch, event handler
  // attached to outer element during patch, and triggered again. This
  // happens because browsers fire microtask ticks between event propagation.
  // the solution is simple: we save the timestamp when a handler is attached,
  // and the handler would only fire if the event passed to it was fired
  // AFTER it was attached.
  if (useMicrotaskFix) {
    var attachedTimestamp = currentFlushTimestamp;
    var original = handler;
    handler = original._wrapper = function (e) {
      if (
        // no bubbling, should always fire.
        // this is just a safety net in case event.timeStamp is unreliable in
        // certain weird environments...
        e.target === e.currentTarget ||
        // event is fired after handler attachment
        e.timeStamp >= attachedTimestamp ||
        // bail for environments that have buggy event.timeStamp implementations
        // #9462 iOS 9 bug: event.timeStamp is 0 after history.pushState
        // #9681 QtWebEngine event.timeStamp is negative value
        e.timeStamp <= 0 ||
        // #9448 bail if event is fired in another document in a multi-page
        // electron/nw.js app, since event.timeStamp will be using a different
        // starting reference
        e.target.ownerDocument !== document
      ) {
        return original.apply(this, arguments)
      }
    };
  }
  // 绑定
  target$1.addEventListener(
    name,
    handler,
    supportsPassive
      ? { capture: capture, passive: passive }
      : capture
  );
}
```

这里，终于看到了原生`addEventListener`方法进行绑定，至此组件中的`button`元素的原生DOM事件的绑定完成。

子组件内部的`button`元素`patch`结束后，回溯到`createComponent`，执行`initComponent`方法：

```javascript
function initComponent (vnode, insertedVnodeQueue) {
  if (isDef(vnode.data.pendingInsert)) {
    insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert);
    vnode.data.pendingInsert = null;
  }
  // 获取组件根节点的真实dom引用
  vnode.elm = vnode.componentInstance.$el;
  if (isPatchable(vnode)) {
    invokeCreateHooks(vnode, insertedVnodeQueue);
    setScope(vnode);
  } else {
    // empty component root.
    // skip all element-related modules except for ref (#3455)
    registerRef(vnode);
    // make sure to invoke the insert hook
    insertedVnodeQueue.push(vnode);
  }
}
```

这里会再次执行`invokeCreateHooks`函数，进而执行`updateDOMListeners`，这样就会将组件上注册的原生事件绑定在`button`元素上。

### 总结

普通元素的原生DOM事件绑定的时机是在`patch`阶段，而组件的原生DOM事件绑定的时机是在组件`patch`结束后，组件的自定义事件是在组件初始化阶段。原生DOM事件和自定义事件的绑定不一样，前者通过底层`addEventListener`方法，后者通过事件中心的`$on`方法。
