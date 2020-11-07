版本是v2.6.11

引用官方文档的一句话： `v-model` 指令在表单 `<input>`、`<textarea>` 及 `<select>` 元素上创建双向数据绑定。`v-model`本质是语法糖，负责监听用户的输入事件以及更新数据。

我们根据案例，探究它的实现原理。

```html
<input v-model="message" placeholder="edit me">
<p>Message is: {{ message }}</p>
```

### 表单元素v-model

编译的`parse`阶段通过`processAttrs`处理`v-model`属性。

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
        // ...
      } else { 
          // normal directives
        name = name.replace(dirRE, '');
        // parse arg
        var argMatch = name.match(argRE);
        var arg = argMatch && argMatch[1];
        isDynamic = false;
        if (arg) {
          name = name.slice(0, -(arg.length + 1));
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1);
            isDynamic = true;
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i]);
        if (name === 'model') {
          checkForAliasModel(el, value);
        }
      }
    } else {
      // ...
    }
  }
}
```

`v-model`属性会命中`normal directives`逻辑，处理`name`，`arg`以及`isDynamic`，然后执行`addDirective`向对应的`el.directies`添加解析后的`v-model`属性。

编译的`generate`阶段，执行`genData`会执行`genDirectives`生成对应的指令代码：

```javascript
function genDirectives (el, state) {
  var dirs = el.directives;
  if (!dirs) { return }
  var res = 'directives:[';
  var hasRuntime = false;
  var i, l, dir, needRuntime;
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i];
    needRuntime = true;
    var gen = state.directives[dir.name];
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn);
    }
    if (needRuntime) {
      hasRuntime = true;
      res += "{name:\"" + (dir.name) + "\",rawName:\"" + (dir.rawName) + "\"" + (dir.value ? (",value:(" + (dir.value) + "),expression:" + (JSON.stringify(dir.value))) : '') + (dir.arg ? (",arg:" + (dir.isDynamicArg ? dir.arg : ("\"" + (dir.arg) + "\""))) : '') + (dir.modifiers ? (",modifiers:" + (JSON.stringify(dir.modifiers))) : '') + "},";
    }
  }
  if (hasRuntime) {
    return res.slice(0, -1) + ']'
  }
}
```

获取刚刚生成的`el.directives`，并对其遍历，执行指令对应的函数，`model`函数源码：

```javascript
function model (
  el,
  dir,
  _warn
) {
  warn$1 = _warn;
  var value = dir.value;
  var modifiers = dir.modifiers;
  var tag = el.tag;
  var type = el.attrsMap.type;

  // ...

  if (el.component) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else if (tag === 'select') {
    genSelect(el, value, modifiers);
  } else if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers);
  } else if (tag === 'input' && type === 'radio') 
    genRadioModel(el, value, modifiers);
  } else if (tag === 'input' || tag === 'textarea') {
    // 命中
    genDefaultModel(el, value, modifiers);
  } else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else {
    // ...
  }

  // ensure runtime directive metadata
  return true
}
```

`model`函数就是根据元素的的不同情况去执行不同的逻辑，我们这里主要看`genDefaultModel`：

```javascript
function genDefaultModel (
  el,
  value,
  modifiers
) {
  var type = el.attrsMap.type;

  // ...

  var ref = modifiers || {};
  var lazy = ref.lazy;
  var number = ref.number;
  var trim = ref.trim;
  var needCompositionGuard = !lazy && type !== 'range';
  var event = lazy
    ? 'change'
    : type === 'range'
      ? RANGE_TOKEN
      : 'input';

  var valueExpression = '$event.target.value';
  if (trim) {
    valueExpression = "$event.target.value.trim()";
  }
  if (number) {
    valueExpression = "_n(" + valueExpression + ")";
  }

  var code = genAssignmentCode(value, valueExpression);
  if (needCompositionGuard) {
    code = "if($event.target.composing)return;" + code;
  }

  addProp(el, 'value', ("(" + value + ")"));
  addHandler(el, event, code, null, true);
  if (trim || number) {
    addHandler(el, 'blur', '$forceUpdate()');
  }
}
```

函数先处理修饰符`modifiers`，根据修饰符确定`needCompositionGuard`和 `event`以及`valueExpression` ，然后通过执行`genAssignmentCode`生成代码，对于案例而言，生成的`code`为`message=$event.target.value`，由于`needCompositionGuard`为`true`，`code`更新为`if($event.target.composing)return;message=$event.target.value`。

最后通过`addProp`给 `el` 添加一个 `props`，相当于我们在 `input` 上动态绑定了 `value`，通过`addHandler`给 `el` 添加`events`，相当于在 `input` 上绑定了 `input` 事件。

回到`genData`，会执行下面2个逻辑：

```javascript
// DOM props
if (el.props) {
   data += "domProps:" + (genProps(el.props)) + ",";
}

// event handlers
if (el.events) {
   data += (genHandlers(el.events, false)) + ",";
}
```

这2个逻辑分别对应了`props`和`events`生成的代码。

最后生成的运行时代码：

```javascript
with (this) {
    return _c('div', [_c('input', {
        directives: [{
            name: "model",
            rawName: "v-model",
            value: (message),
            expression: "message"
        }],
        attrs: {
            "placeholder": "edit me"
        },
        domProps: {
            "value": (message)
        },
        on: {
            "input": function($event) {
                if ($event.target.composing)
                    return;
                message = $event.target.value
            }
        }
    }), _c('p', [_v("Message is: " + _s(message))])])
}
```

从代码可以出，`v-model`被转化为动态属性`value`和`input`事件，其中`value`的值就是`message`，而`input`事件就是把`message`设置为目标元素的值，这样实际上就完成了数据双向绑定了，所以说 `v-model` 实际上就是语法糖。

### 组件v-model

组件上也可以绑定`v-model`，组件`v-model`和普通元素一样都会被转化为动态属性`value`和`input`事件，但是转化的时机不是在编译阶段，接下来我们根据案例来分析它究竟是在哪个阶段没转化的。

父组件：

```html
<div>
	<child v-model="message"></child>
	<p>Message is: {{ message }}</p>
</div>
```

子组件：

```html
<input :value="value" @input="updateValue" placeholder="edit me">
```

对于父组件而言，在编译的`generate`阶段，同样会执行`genData`中的`genDirectives`，进而执行`model`函数，并且命中了如下逻辑：

```javascript
else if (!config.isReservedTag(tag)) {
  genComponentModel(el, value, modifiers);
  return false
}
```

```javascript
function genComponentModel (
  el,
  value,
  modifiers
) {
  var ref = modifiers || {};
  var number = ref.number;
  var trim = ref.trim;

  var baseValueExpression = '$$v';
  var valueExpression = baseValueExpression;
  if (trim) {
    valueExpression =
      "(typeof " + baseValueExpression + " === 'string'" +
      "? " + baseValueExpression + ".trim()" +
      ": " + baseValueExpression + ")";
  }
  if (number) {
    valueExpression = "_n(" + valueExpression + ")";
  }
  var assignment = genAssignmentCode(value, valueExpression);

  el.model = {
    value: ("(" + value + ")"),
    expression: JSON.stringify(value),
    callback: ("function (" + baseValueExpression + ") {" + assignment + "}")
  };
}
```

`genComponentModel`逻辑很简单，对于例子而言，最后生成的`el.model`：

```javascript
el.model = {
    callback: "function ($$v) {message=$$v}",
    expression: ""message"",
    value: "(message)"
}
```

回到`genData`，会执行这段逻辑：

```javascript
// component v-model
  if (el.model) {
    data += "model:{value:" + (el.model.value) + ",callback:" + (el.model.callback) + ",expression:" + (el.model.expression) + "},";
  }
```

最后父组件生成的代码如下：

```javascript
 with (this) {
     return _c('div', [_c('child', {
         model: {
             value: (message),
             callback: function($$v) {
                 message = $$v
             },
             expression: "message"
         }
     }), _c('p', [_v("Message is: " + _s(message))])], 1)
 }
```

父组件在`render`阶段，如果创建的`vnode`是组件，那么它会执行`createComponent`：

```javascript
function createComponent (
  Ctor,
  data,
  context,
  children,
  tag
) {
  // ...


  // transform component v-model data into props & events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data);
  }
      
  // ...

  var vnode = new VNode(
    ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
    data, undefined, undefined, undefined, context,
    { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
    asyncFactory
  );

  return vnode
}
```

会执行`transformModel`：

```javascript
function transformModel (options, data) {
  var prop = (options.model && options.model.prop) || 'value';
  var event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value;
  var on = data.on || (data.on = {});
  var existing = on[event];
  var callback = data.model.callback;
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing);
    }
  } else {
    on[event] = callback;
  }
}
```

首先，会获取子组件选项上的`model.prop`和`model.event`，如果没有设置，则默认是`value`和`input`，然后给 `data.props` 添加 `data.model.value`，给`data.on` 添加 `data.model.callback`，对于案例而言：

```javascript
data.props = {
  value: (message),
}

data.on = {
  input: function ($$v) {
    message=$$v
  }
} 
```

到这里，组件的`v-model`相当于已经转化完毕。

### 总结

`v-model`是真正意义上的双向绑定，这是因为动态属性`value`绑定了要数据，修改数据时能改变DOM，`input`事件设置数据为当前目标元素的值，当前`value`改变就执行数据赋值，DOM修改时改变数据。

对于组件`v-model`而言，我们先编译的是它的`data.model`，在创建组件`vnode`过程中在进行转化，而转化后的`input`事件由于是自定义事件，所以需要子组件使用`$emit`进行触发。