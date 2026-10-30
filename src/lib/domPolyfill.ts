// Comprehensive DOM patch to prevent NotFoundError crashes in React when browser translation (Google Translate, Edge Translate) or browser extensions mutate or wrap DOM text/elements.
if (typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    try {
      if (!child) return child;
      if (child.parentNode !== this) {
        if (child.parentNode) {
          try {
            return child.parentNode.removeChild(child);
          } catch {
            return child;
          }
        }
        return child;
      }
      return originalRemoveChild.call(this, child) as T;
    } catch {
      return child;
    }
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    try {
      if (!newNode) return newNode;
      if (referenceNode && referenceNode.parentNode !== this) {
        // If referenceNode has been wrapped by translator (e.g. <font>), its parentNode may be inside `this`
        if (referenceNode.parentNode && this.contains(referenceNode.parentNode)) {
          // Find the child of `this` that contains referenceNode
          let directChild: Node = referenceNode.parentNode;
          while (directChild.parentNode && directChild.parentNode !== this) {
            directChild = directChild.parentNode;
          }
          if (directChild.parentNode === this) {
            return originalInsertBefore.call(this, newNode, directChild) as T;
          }
        }
        // Fallback: safely append to `this`
        return originalInsertBefore.call(this, newNode, null) as T;
      }
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch {
      try {
        return originalInsertBefore.call(this, newNode, null) as T;
      } catch {
        return newNode;
      }
    }
  };

  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
    try {
      if (!oldChild) return oldChild;
      if (oldChild.parentNode !== this) {
        if (oldChild.parentNode) {
          try {
            return oldChild.parentNode.replaceChild(newChild, oldChild) as T;
          } catch {}
        }
        try {
          originalInsertBefore.call(this, newChild, null);
        } catch {}
        return oldChild;
      }
      return originalReplaceChild.call(this, newChild, oldChild) as T;
    } catch {
      try {
        originalInsertBefore.call(this, newChild, null);
      } catch {}
      return oldChild;
    }
  };
}
