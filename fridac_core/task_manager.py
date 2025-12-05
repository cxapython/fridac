"""
fridacli 多脚本任务管理器
基于 Frida Script 隔离的真正任务管理实现
"""

import time
from datetime import datetime
from typing import Dict, Optional, List, Any
from dataclasses import dataclass
from enum import Enum

from .logger import log_info, log_success, log_warning, log_error, get_console, render_structured_event

class TaskType(Enum):
    """任务类型枚举"""
    METHOD_HOOK = "method_hook"
    CLASS_HOOK = "class_hook" 
    NATIVE_HOOK = "native_hook"
    LOCATION_HOOK = "location_hook"
    BATCH_HOOK = "batch_hook"
    CUSTOM_HOOK = "custom_hook"
    # 新增任务类型
    TRACE_CLASS = "trace_class"       # traceClass 函数
    TRACE_METHOD = "trace_method"     # traceMethod 函数
    NETWORK_FETCH = "network_fetch"   # fetch 网络抓包
    OKHTTP_HOLD = "okhttp_hold"       # OkHttp 拦截
    ADVANCED_TRACE = "advanced_trace" # 高级追踪

class TaskStatus(Enum):
    """任务状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class TaskInfo:
    """任务信息数据类"""
    task_id: int
    task_type: TaskType
    target: str
    description: str
    script_handle: Any  # Frida Script对象
    session_handle: Any  # Frida Session对象
    status: TaskStatus
    created_at: datetime
    options: Dict[str, Any]
    error_message: Optional[str] = None
    hit_count: int = 0
    last_hit: Optional[datetime] = None

class FridaTaskManager:
    """
    Frida 多脚本任务管理器
    
    核心特性：
    1. 每个任务创建独立的 Frida Script
    2. 任务完全隔离，互不干扰
    3. 通过 script.unload() 实现真正的清理
    4. 保持与现有Hook函数的兼容性
    """
    
    def __init__(self, main_session):
        """
        初始化任务管理器
        
        Args:
            main_session: 主 Frida Session 对象
        """
        self.main_session = main_session
        self.device = main_session.device if hasattr(main_session, 'device') else None
        self.pid = main_session.pid if hasattr(main_session, 'pid') else None
        
        self.tasks: Dict[int, TaskInfo] = {}
        self.next_task_id = 1
        
        log_info("🎯 任务管理器已初始化 (多脚本隔离模式)")
    
    def create_task(self, task_type: TaskType, target: str, script_source: str, 
                   description: str = "", options: Dict[str, Any] = None) -> int:
        """
        创建新的任务（独立脚本）
        
        Args:
            task_type: 任务类型
            target: Hook目标 (类名、方法名等)
            script_source: JavaScript 脚本源码
            description: 任务描述
            options: 任务选项
            
        Returns:
            任务 ID，失败返回 -1
        """
        if options is None:
            options = {}
            
        task_id = self.next_task_id
        self.next_task_id += 1
        
        try:
            # 创建独立脚本（重用主 session 以避免重复 attach）
            script_source_with_id = script_source.replace('var TASK_ID = 0;', f'var TASK_ID = {task_id};')
            script = self.main_session.create_script(script_source_with_id)
            
            # 设置消息处理（可扩展）
            def on_message(message, data):
                try:
                    msg_type = message.get('type')
                    if msg_type == 'send':
                        payload = message.get('payload')
                        # 任务统计：识别带 task_id 的结构化消息
                        if isinstance(payload, dict):
                            if payload.get('task_id') == task_id:
                                self._update_task_stats(task_id)
                            # 使用统一结构化渲染，并附带任务前缀
                            render_structured_event(payload, task_id=task_id)
                        else:
                             # 普通文本日志（来自 LOG）
                            text = '' if payload is None else str(payload)
                            console = get_console()
                            if console:
                                from rich.text import Text
                                style = None
                                if text.startswith('✅') or text.startswith('🟢'):
                                    style = 'green'
                                elif text.startswith('❌') or text.startswith('🔴'):
                                    style = 'red'
                                elif text.startswith('⚠️') or text.startswith('🟡'):
                                    style = 'yellow'
                                elif text.startswith('🔍') or text.startswith('📚') or text.startswith('🌐'):
                                    style = 'cyan'
                                elif text.startswith('🔧') or text.startswith('🎯'):
                                    style = 'bright_white'
                                console.print(Text(f"[#${task_id}] {text}", style=style or 'white'))
                            else:
                                log_info(f"[#${task_id}] {text}")
                    elif msg_type == 'error':
                        desc = message.get('description') or message
                        log_error(f"任务 #{task_id} 脚本错误: {desc}")
                except Exception as e:
                    log_error(f"任务 #{task_id} 消息处理失败: {e}")
            
            script.on('message', on_message)
            
            # 加载脚本
            script.load()
            
            # 创建任务信息
            task_info = TaskInfo(
                task_id=task_id,
                task_type=task_type,
                target=target,
                description=description or f"{task_type.value}: {target}",
                script_handle=script,
                session_handle=None,  # 重用主session
                status=TaskStatus.RUNNING,
                created_at=datetime.now(),
                options=options
            )
            
            self.tasks[task_id] = task_info
            
            log_success(f"✅ 任务 #{task_id} 创建成功: {task_info.description}")
            return task_id
            
        except Exception as e:
            log_error(f"❌ 创建任务失败: {e}")
            return -1
    
    def kill_task(self, task_id: int) -> bool:
        """
        终止指定任务（完全清理）
        
        Args:
            task_id: 任务ID
            
        Returns:
            是否成功终止
        """
        if task_id not in self.tasks:
            log_warning(f"⚠️ 任务 #{task_id} 不存在")
            return False
        
        task = self.tasks[task_id]
        
        try:
            # 卸载脚本 - 这会完全清理所有 Hook
            if task.script_handle:
                task.script_handle.unload()
            
            # 注意：重用主 session，无需在此处 detach session
            
            # 更新状态
            task.status = TaskStatus.CANCELLED
            
            # 从活跃任务中移除
            del self.tasks[task_id]
            
            log_success(f"🗑️ 任务 #{task_id} 已终止: {task.description}")
            return True
            
        except Exception as e:
            # 如果脚本已销毁，无需重复报错，直接从任务表移除
            msg = str(e)
            if 'destroyed' in msg or 'Script is destroyed' in msg or 'script is destroyed' in msg:
                try:
                    if task_id in self.tasks:
                        del self.tasks[task_id]
                except Exception:
                    pass
                log_warning(f"⚠️  任务 #{task_id} 的脚本已销毁，已从任务列表移除")
                return True
            log_error(f"❌ 终止任务 #{task_id} 失败: {e}")
            task.status = TaskStatus.FAILED
            task.error_message = msg
            return False
    
    def kill_all_tasks(self, task_type_filter: Optional[TaskType] = None) -> int:
        """
        终止所有任务
        
        Args:
            task_type_filter: 可选的任务类型过滤器
            
        Returns:
            成功终止的任务数量
        """
        tasks_to_kill = []
        
        for task_id, task in self.tasks.items():
            if task_type_filter is None or task.task_type == task_type_filter:
                tasks_to_kill.append(task_id)
        
        if not tasks_to_kill:
            filter_msg = f" (类型: {task_type_filter.value})" if task_type_filter else ""
            log_info(f"📋 没有找到要终止的任务{filter_msg}")
            return 0
        
        killed_count = 0
        for task_id in tasks_to_kill:
            if self.kill_task(task_id):
                killed_count += 1
        
        log_success(f"🧹 已终止 {killed_count}/{len(tasks_to_kill)} 个任务")
        return killed_count
    
    def list_tasks(self, status_filter: Optional[TaskStatus] = None) -> List[TaskInfo]:
        """
        列出所有任务
        
        Args:
            status_filter: 可选的状态过滤器
            
        Returns:
            任务信息列表
        """
        tasks = list(self.tasks.values())
        
        if status_filter:
            tasks = [task for task in tasks if task.status == status_filter]
        
        return tasks
    
    def get_task(self, task_id: int) -> Optional[TaskInfo]:
        """
        获取指定任务信息
        
        Args:
            task_id: 任务ID
            
        Returns:
            任务信息，不存在返回 None
        """
        return self.tasks.get(task_id)
    
    def show_tasks(self, status_filter: Optional[TaskStatus] = None):
        """
        显示任务列表（格式化输出）
        
        Args:
            status_filter: 可选的状态过滤器
        """
        tasks = self.list_tasks(status_filter)
        
        if not tasks:
            filter_msg = f" (状态: {status_filter.value})" if status_filter else ""
            log_info(f"📋 没有找到任务{filter_msg}")
            return
        
        # 表头
        filter_msg = f" (状态: {status_filter.value})" if status_filter else ""
        log_info(f"\n📋 任务列表{filter_msg}")
        log_info("=" * 80)
        log_info(f"{'ID':<4} {'类型':<12} {'状态':<8} {'目标':<30} {'创建时间'}")
        log_info("-" * 80)
        
        # 任务列表
        for task in tasks:
            status_icon = self._get_status_icon(task.status)
            created_time = task.created_at.strftime("%H:%M:%S")
            hit_info = f" (命中:{task.hit_count})" if task.hit_count > 0 else ""
            
            log_info(f"{task.task_id:<4} {task.task_type.value:<12} "
                    f"{status_icon}{task.status.value:<7} "
                    f"{task.target[:28]:<30} {created_time}{hit_info}")
        
        log_info("-" * 80)
        log_info(f"📊 总计: {len(tasks)} 个任务")
    
    def show_task_details(self, task_id: int):
        """
        显示任务详细信息
        
        Args:
            task_id: 任务ID
        """
        task = self.get_task(task_id)
        if not task:
            log_warning(f"⚠️ 任务 #{task_id} 不存在")
            return
        
        log_info(f"\n🔍 任务 #{task.task_id} 详细信息")
        log_info("=" * 50)
        log_info(f"类型: {task.task_type.value}")
        log_info(f"目标: {task.target}")
        log_info(f"描述: {task.description}")
        log_info(f"状态: {self._get_status_icon(task.status)}{task.status.value}")
        log_info(f"创建时间: {task.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        
        if task.hit_count > 0:
            log_info(f"命中次数: {task.hit_count}")
            if task.last_hit:
                log_info(f"最后命中: {task.last_hit.strftime('%H:%M:%S')}")
        
        if task.error_message:
            log_error(f"错误信息: {task.error_message}")
        
        if task.options:
            log_info(f"选项: {task.options}")
    
    def cleanup(self):
        """
        清理所有任务（程序退出时调用）
        """
        if not self.tasks:
            return
        
        log_info("🧹 正在清理所有任务...")
        task_count = len(self.tasks)
        self.kill_all_tasks()
        log_success(f"✅ 已清理 {task_count} 个任务")
    
    def _update_task_stats(self, task_id: int):
        """
        更新任务统计信息
        
        Args:
            task_id: 任务ID
        """
        if task_id in self.tasks:
            task = self.tasks[task_id]
            task.hit_count += 1
            task.last_hit = datetime.now()
    
    def _get_status_icon(self, status: TaskStatus) -> str:
        """
        获取状态图标
        
        Args:
            status: 任务状态
            
        Returns:
            状态图标
        """
        icons = {
            TaskStatus.PENDING: "⏳ ",
            TaskStatus.RUNNING: "🟢 ",
            TaskStatus.COMPLETED: "✅ ",
            TaskStatus.FAILED: "❌ ",
            TaskStatus.CANCELLED: "🚫 "
        }
        return icons.get(status, "❓ ")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        获取任务统计信息
        
        Returns:
            统计信息字典
        """
        total_tasks = len(self.tasks)
        status_counts = {}
        type_counts = {}
        total_hits = 0
        
        for task in self.tasks.values():
            # 状态统计
            status = task.status.value
            status_counts[status] = status_counts.get(status, 0) + 1
            
            # 类型统计
            task_type = task.task_type.value
            type_counts[task_type] = type_counts.get(task_type, 0) + 1
            
            # 命中统计
            total_hits += task.hit_count
        
        return {
            'total_tasks': total_tasks,
            'status_counts': status_counts,
            'type_counts': type_counts,
            'total_hits': total_hits,
            'next_task_id': self.next_task_id
        }
    
    def show_stats(self):
        """
        显示任务统计信息
        """
        stats = self.get_stats()
        
        log_info("\n📊 任务统计信息")
        log_info("=" * 40)
        log_info(f"总任务数: {stats['total_tasks']}")
        log_info(f"总命中数: {stats['total_hits']}")
        log_info(f"下一个ID: {stats['next_task_id']}")
        
        if stats['status_counts']:
            log_info("\n状态分布:")
            for status, count in stats['status_counts'].items():
                log_info(f"  {status}: {count}")
        
        if stats['type_counts']:
            log_info("\n类型分布:")
            for task_type, count in stats['type_counts'].items():
                log_info(f"  {task_type}: {count}")