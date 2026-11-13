export interface HttpClient {
  send(request: Request): Promise<Response>;
}
