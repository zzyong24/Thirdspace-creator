/** 明确写给用户看的工具输入/权限错误；未知异常不得借用此类型。 */
export class ChatToolUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatToolUserError";
  }
}
