package config

import (
	"fmt"
	"time"
)

type GoUnoConfig struct {
	WebServerConfig    WebServerConfig    `mapstructure:"web_server"`
	DatabaseConfig     DatabaseConfig     `mapstructure:"database"`
	BigCacheConfig     BigCacheConfig     `mapstructure:"bigcache"`
	RedisConfig        RedisConfig        `mapstructure:"redis"`
	TaskPipelineConfig TaskPipelineConfig `mapstructure:"task_pipeline"`
	SMTPConfig         SMTPConfig         `mapstructure:"smtp"`
	CaptchaConfig      CaptchaConfig      `mapstructure:"captcha"`
	LogConfig          LogConfig          `mapstructure:"log"`
}

type WebServerConfig struct {
	Debug              bool          `mapstructure:"debug"`
	Address            string        `mapstructure:"address"`
	Port               string        `mapstructure:"port"`
	IdleTimeout        time.Duration `mapstructure:"idle_timeout"`
	ReadTimeout        time.Duration `mapstructure:"read_timeout"`
	ReadHeaderTimeout  time.Duration `mapstructure:"read_header_timeout"`
	WriteTimeout       time.Duration `mapstructure:"write_timeout"`
	RequestTimeout     time.Duration `mapstructure:"request_timeout"`
	RateLimitPerMinute int           `mapstructure:"rate_limit_per_minute"`
}

type DatabaseConfigDriverName string

type DatabaseConfigDriver struct {
	Name     DatabaseConfigDriverName `mapstructure:"name"`
	Driver   string                   `mapstructure:"driver"`
	DSN      string                   `mapstructure:"dsn"`
	LogLevel int                      `mapstructure:"log_level"`
}

type DatabaseConfig struct {
	Default DatabaseConfigDriverName                          `mapstructure:"default"`
	Drivers map[DatabaseConfigDriverName]DatabaseConfigDriver `mapstructure:"drivers"`
}

func (c DatabaseConfig) GetDriver(name DatabaseConfigDriverName) *DatabaseConfigDriver {
	if driver, ok := c.Drivers[name]; ok {
		return &driver
	} else {
		return nil
	}
}

func (c DatabaseConfig) GetDefaultDriver() *DatabaseConfigDriver {
	if driver, ok := c.Drivers[c.Default]; ok {
		return &driver
	} else {
		return nil
	}
}

type BigCacheConfig struct {
	HardMaxCacheSize int `mapstructure:"hard_max_cache_size"`
}

type RedisConfig struct {
	DSN                string `mapstructure:"dsn"`
	MaxActiveConns     int    `mapstructure:"max_active_conns"`
	PoolTimeoutSeconds int    `mapstructure:"pool_timeout_seconds"`
}

type TaskPipelineConfig struct {
	// FlushSize 批处理数据的最大容量
	FlushSize uint32 `mapstructure:"flush_size"`
	// BufferSize 缓冲通道的容量
	BufferSize uint32 `mapstructure:"buffer_size"`
	// FlushInterval 定时刷新的时间间隔
	FlushInterval time.Duration `mapstructure:"flush_interval"`
}

type SMTPConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	From     string `mapstructure:"from"`
}

type CaptchaConfig struct {
	Type string `mapstructure:"type"`
}

type LogConfig struct {
	// 日志级别: -1: Debug, 0: Info, 1: Warn, 2: Error, 3: DPanic, 4: Panic, 5: Fatal
	Level int `mapstructure:"level"`
}

func (c GoUnoConfig) Validate() error {
	if c.WebServerConfig.Port == "" {
		return fmt.Errorf("web_server: port is required")
	}
	if c.WebServerConfig.IdleTimeout <= 0 {
		return fmt.Errorf("web_server: idle_timeout must be positive")
	}
	if c.WebServerConfig.ReadTimeout <= 0 {
		return fmt.Errorf("web_server: read_timeout must be positive")
	}
	if c.WebServerConfig.ReadHeaderTimeout <= 0 {
		return fmt.Errorf("web_server: read_header_timeout must be positive")
	}
	if c.WebServerConfig.WriteTimeout <= 0 {
		return fmt.Errorf("web_server: write_timeout must be positive")
	}
	if c.WebServerConfig.RequestTimeout <= 0 {
		return fmt.Errorf("web_server: request_timeout must be positive")
	}
	if c.WebServerConfig.RateLimitPerMinute <= 0 {
		return fmt.Errorf("web_server: rate_limit_per_minute must be positive")
	}
	if c.DatabaseConfig.GetDefaultDriver() == nil {
		return fmt.Errorf("database: no default driver configured")
	}
	if c.DatabaseConfig.GetDefaultDriver().DSN == "" {
		return fmt.Errorf("database: default driver DSN is empty")
	}
	if c.LogConfig.Level < -1 || c.LogConfig.Level > 5 {
		return fmt.Errorf("log: level must be between -1 and 5")
	}
	return nil
}
