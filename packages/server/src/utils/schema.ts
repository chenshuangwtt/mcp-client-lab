/**
 * 极简Schema修补函数：为缺少items的数组类型添加最小合法定义
 * @param schema 原始JSON Schema
 * @param options 配置项（可选）
 * @returns 修补后的Schema（原Schema保持不变）
 */
export function patchSchemaArrays(
  schema: any,
  options: {
    log?: boolean; // 打印修补日志
    defaultItems?: any; // 自定义默认items（默认：{ type: "object" }）
  } = {}
): any {
  const { log, defaultItems = { type: "object" } } = options;
  const newSchema = JSON.parse(JSON.stringify(schema)); // 避免修改原始对象

  function processObject(node: any, path: string[]) {
    // 处理对象的所有属性
    if (node?.properties) {
      Object.entries(node.properties).forEach(([key, prop]: [string, any]) => {
        if (Array.isArray(prop.type) && prop.type.length > 1) {
          // 兼容豆包，type 不能为数组
          prop.type = prop.type[0];
        }
        if (prop.type === "array" && !prop.items) {
          // 发现缺少items的数组属性
          prop.items = defaultItems;
          if (log) {
            console.log(
              `[SimplePatcher] 修补属性: ${path.join(".")}.${key}`,
              prop
            );
          }
        }
        // 递归处理子对象（如果属性是对象）
        if (prop.type === "object") {
          processObject(prop, [...path, key]);
        }
      });
    }

    // 处理数组的items（如果当前node是数组的items）
    if (node?.items && node.items.type === "array" && !node.items.items) {
      node.items.items = defaultItems;
      if (log) {
        console.log(
          `[SimplePatcher] 修补嵌套数组: ${path.join(".")}.items`,
          node.items
        );
      }
    }
  }

  // 入口：从根对象开始处理
  if (newSchema.type === "object") {
    processObject(newSchema, []);
  }

  return newSchema;
}
