package config

import (
	"fmt"
	"strings"
	"sync"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

type ConfigManager struct {
	configMutex sync.RWMutex
	config      *GoUnoConfig
}

// NewConfigManager 创建配置管理器。
// cmd 传入 Cobra 命令以绑定 CLI flag 到配置项，可传 nil。
func NewConfigManager(
	cmd *cobra.Command,
	configPath string,
	env string,
) (*ConfigManager, error) {

	configManager := ConfigManager{}

	v := viper.New()
	configManager.setConfigDefaults(v)
	v.AddConfigPath(configPath)
	v.SetConfigName(env)
	v.SetConfigType("yaml")

	v.SetEnvPrefix("GOUNO")
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// 将 CLI flag 绑定到局部 viper 实例
	if cmd != nil {
		if f := cmd.Flags().Lookup("address"); f != nil {
			v.BindPFlag("web_server.address", f)
		}
		if f := cmd.Flags().Lookup("port"); f != nil {
			v.BindPFlag("web_server.port", f)
		}
		if f := cmd.Flags().Lookup("debug"); f != nil {
			v.BindPFlag("web_server.debug", f)
		}
		if f := cmd.Flags().Lookup("env"); f != nil {
			v.BindPFlag("gouno_env", f)
		}
	}

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	newConfig := GoUnoConfig{}
	if err := v.Unmarshal(&newConfig); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}
	if err := newConfig.Validate(); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}
	configManager.SetConfig(&newConfig)
	return &configManager, nil
}

func (cm *ConfigManager) SetConfig(config *GoUnoConfig) {
	cm.configMutex.Lock()
	defer cm.configMutex.Unlock()
	cm.config = config
}

func (cm *ConfigManager) Config() GoUnoConfig {
	cm.configMutex.RLock()
	defer cm.configMutex.RUnlock()
	if cm.config == nil {
		return GoUnoConfig{}
	}
	return *cm.config
}

func (cm *ConfigManager) setConfigDefaults(v *viper.Viper) {
	// 验证码配置
	v.SetDefault("captcha_type", "math")

	// Web服务器配置
	v.SetDefault("web_server.debug", false)
	v.SetDefault("web_server.address", "0.0.0.0")
	v.SetDefault("web_server.port", "8080")
	v.SetDefault("web_server.idle_timeout", "60s")
	v.SetDefault("web_server.read_timeout", "5s")
	v.SetDefault("web_server.read_header_timeout", "2s")
	v.SetDefault("web_server.write_timeout", "30s")
	v.SetDefault("web_server.request_timeout", "10s")
	v.SetDefault("web_server.rate_limit_per_minute", 100)

	// 数据库配置
	v.SetDefault("database.default", "sqlite")
	v.SetDefault("database.drivers.sqlite.name", "sqlite")
	v.SetDefault("database.drivers.sqlite.driver", "sqlite3")
	v.SetDefault("database.drivers.sqlite.dsn", ":memory:")
	v.SetDefault("database.drivers.sqlite.log_level", 1)
}
