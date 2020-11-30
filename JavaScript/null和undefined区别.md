### null和undefined区别

* null

1. **null转成number类型的值为0**
2. typeof的返回结果为object，这是因为Javascript数据类型底层用二进制表示的，二进制的前三位为0会被typeof判断为对象类型，而null二进制位都是0，所以会被误判为object。
3. **空对象，当一个对象被赋值了null 以后，原来的对象在内存中就处于游离状态，GC 会回收该对象并释放内存**

* undefined

1. var定义的变量，没有初始化，会被初始化为undefined
2. 函数的形参，在执行时没传入实参，显示为undefined
3. 函数没有return时，返回值为undefined
4. 对象属性不存在时，访问时显示undefined
5. **表达式的原始状态值，例如1，2，3，4条，不是人为操作的结果**
6. **undefined转成number类型的值为NaN**

```javascript
undefined == null // 非严格相等 true
undefined === null // 严格相等 false
```



#### 参考文章

1. [详解 undefined 与 null 的区别](https://www.cnblogs.com/onepixel/p/7337248.html)