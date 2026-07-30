import { ArrowLeft, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return <div className="public-container not-found"><strong>404</strong><p>这条路径还没有成为文章。</p><h1>你寻找的页面不存在，<br />但问题也许仍值得继续追踪。</h1><form onSubmit={(event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get('q'); navigate(`/search?q=${encodeURIComponent(String(query || ''))}`); }}><Search /><input name="q" aria-label="搜索文章" placeholder="搜索文章或主题" /><button>搜索</button></form><div><Link to="/"><ArrowLeft /> 回到首页</Link><Link to="/articles">浏览全部文章</Link></div></div>;
}

