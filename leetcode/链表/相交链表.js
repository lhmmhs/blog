// 解题思路：双指针
// 3->1->4->9->6->null->2->5->6
// 2->5->6->null->3->1->4->9->6
// a+b = b+a

var getIntersectionNode = function (headA, headB) {
  if (headA == null || headB == null) return null
  let A = headA
  let B = headB

  // 只要A和B不相同就一直循环
  // 相同时,退出循环,即使同时为null,也会退出
  // 都是null则说明不相交
  while (A !== B) {
    A = A === null ? headB : A.next
    B = B === null ? headA : B.next
  }

  return A
}
