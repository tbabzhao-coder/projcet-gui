#!/usr/bin/env python3
"""
HAR 分析脚本 - 从 HAR 文件中提取关键信息
用于 apa-builder 分析录制产物
"""

import json
import sys
from urllib.parse import urlparse


# 静态资源扩展名
STATIC_EXTENSIONS = {'.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map'}

# 登录相关关键词
LOGIN_KEYWORDS = {'login', 'signin', 'sign-in', 'auth', 'oauth', 'sso', 'token'}

# 敏感字段
SENSITIVE_FIELDS = {'password', 'passwd', 'pwd', 'secret', 'token', 'access_token', 'refresh_token'}


def is_static_resource(url: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path.lower()
    return any(path.endswith(ext) for ext in STATIC_EXTENSIONS)


def is_login_request(url: str, request: dict) -> bool:
    url_lower = url.lower()
    if any(kw in url_lower for kw in LOGIN_KEYWORDS):
        return True
    post_data = request.get('postData', {})
    if post_data:
        text = post_data.get('text', '').lower()
        if any(field in text for field in SENSITIVE_FIELDS):
            return True
    return False


def has_dynamic_token(request: dict) -> bool:
    """检查请求是否包含前端动态生成的 token"""
    headers = {h['name'].lower(): h['value'] for h in request.get('headers', [])}

    # 检查 CSRF token
    if any(k for k in headers if 'csrf' in k or 'xsrf' in k):
        return True

    # 检查 request body 中的 token 字段
    post_data = request.get('postData', {})
    if post_data:
        text = post_data.get('text', '')
        if '__RequestVerificationToken' in text or '_csrf' in text:
            return True

    return False


def extract_api_calls(har_data: dict) -> list:
    """从 HAR 中提取可能的 API 调用"""
    entries = har_data.get('log', {}).get('entries', [])
    api_calls = []

    for entry in entries:
        request = entry.get('request', {})
        response = entry.get('response', {})
        url = request.get('url', '')

        # 跳过静态资源
        if is_static_resource(url):
            continue

        # 判断是否是 API 请求
        is_api = (
            '/api/' in url or
            '/v1/' in url or
            '/v2/' in url or
            request.get('method', 'GET') != 'GET'
        )

        if not is_api:
            # 检查 response content-type
            resp_headers = {h['name'].lower(): h['value'] for h in response.get('headers', [])}
            content_type = resp_headers.get('content-type', '')
            if 'application/json' in content_type:
                is_api = True

        if not is_api:
            continue

        # 构建 API 调用信息
        call = {
            'method': request.get('method'),
            'url': url,
            'timestamp': entry.get('startedDateTime'),
            'is_login': is_login_request(url, request),
            'has_dynamic_token': has_dynamic_token(request),
            'status': response.get('status'),
        }

        # 提取请求参数（过滤敏感信息）
        if not call['is_login']:
            if request.get('postData'):
                call['post_data'] = request['postData'].get('text', '')[:500]
            if request.get('queryString'):
                call['query_params'] = request['queryString']

            # 提取响应摘要
            content = response.get('content', {})
            resp_text = content.get('text', '')
            if resp_text:
                try:
                    resp_json = json.loads(resp_text)
                    # 只保留顶层 key 结构
                    call['response_keys'] = list(resp_json.keys()) if isinstance(resp_json, dict) else '[array]'
                except (json.JSONDecodeError, TypeError):
                    call['response_keys'] = '[non-json]'
        else:
            call['post_data'] = '[FILTERED - login request]'
            call['response_keys'] = '[FILTERED - login response]'

        api_calls.append(call)

    return api_calls


def analyze_har(har_path: str) -> dict:
    """分析 HAR 文件，返回结构化结果"""
    with open(har_path, 'r', encoding='utf-8') as f:
        har_data = json.load(f)

    api_calls = extract_api_calls(har_data)

    # 分类
    login_calls = [c for c in api_calls if c['is_login']]
    callable_apis = [c for c in api_calls if not c['is_login'] and not c['has_dynamic_token']]
    dynamic_token_apis = [c for c in api_calls if c['has_dynamic_token']]

    return {
        'total_entries': len(har_data.get('log', {}).get('entries', [])),
        'api_calls_count': len(api_calls),
        'login_calls': len(login_calls),
        'callable_apis': callable_apis,
        'dynamic_token_apis': dynamic_token_apis,
        'summary': {
            'can_use_api': len(callable_apis),
            'need_playwright': len(dynamic_token_apis) + len(login_calls),
        }
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python analyze_har.py <har_file_path>')
        sys.exit(1)

    result = analyze_har(sys.argv[1])
    print(json.dumps(result, indent=2, ensure_ascii=False))
