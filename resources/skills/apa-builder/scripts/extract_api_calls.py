#!/usr/bin/env python3
"""
从 HAR 文件中提取可直接调用的 API 调用
输出格式化的 API 列表，供 AI 生成混合模式脚本使用
"""

import json
import sys
from urllib.parse import urlparse, parse_qs


STATIC_EXTENSIONS = {'.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map'}
LOGIN_KEYWORDS = {'login', 'signin', 'sign-in', 'auth', 'oauth', 'sso'}
SENSITIVE_FIELDS = {'password', 'passwd', 'pwd', 'secret'}


def extract_api_calls(har_path: str) -> list:
    with open(har_path, 'r', encoding='utf-8') as f:
        har_data = json.load(f)

    entries = har_data.get('log', {}).get('entries', [])
    results = []

    for entry in entries:
        request = entry['request']
        response = entry['response']
        url = request['url']
        parsed = urlparse(url)

        # 跳过静态资源
        if any(parsed.path.lower().endswith(ext) for ext in STATIC_EXTENSIONS):
            continue

        # 跳过登录接口
        if any(kw in parsed.path.lower() for kw in LOGIN_KEYWORDS):
            continue

        # 检查是否是 API 请求
        resp_headers = {h['name'].lower(): h['value'] for h in response.get('headers', [])}
        content_type = resp_headers.get('content-type', '')

        is_api = (
            '/api/' in url or
            'application/json' in content_type or
            request['method'] in ('POST', 'PUT', 'PATCH', 'DELETE')
        )

        if not is_api:
            continue

        # 提取参数
        query_params = parse_qs(parsed.query)
        post_body = None
        if request.get('postData', {}).get('text'):
            try:
                post_body = json.loads(request['postData']['text'])
            except (json.JSONDecodeError, TypeError):
                post_body = request['postData']['text'][:200]

        # 提取响应结构
        resp_body = None
        if response.get('content', {}).get('text'):
            try:
                resp_json = json.loads(response['content']['text'])
                if isinstance(resp_json, dict):
                    resp_body = {k: type(v).__name__ for k, v in resp_json.items()}
                else:
                    resp_body = f'[array of {len(resp_json)} items]'
            except (json.JSONDecodeError, TypeError):
                resp_body = '[non-json]'

        results.append({
            'method': request['method'],
            'url': f'{parsed.scheme}://{parsed.netloc}{parsed.path}',
            'query_params': {k: v[0] if len(v) == 1 else v for k, v in query_params.items()},
            'post_body': post_body,
            'response_structure': resp_body,
            'status': response['status'],
            'timestamp': entry.get('startedDateTime'),
        })

    return results


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python extract_api_calls.py <har_file_path>')
        sys.exit(1)

    calls = extract_api_calls(sys.argv[1])
    print(json.dumps(calls, indent=2, ensure_ascii=False))
