package utility

import (
	"fmt"
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// InitLogger 初始化全局 logger
func NewLogger(level zap.AtomicLevel) *zap.Logger {

	// 创建自定义编码器配置
	encoderConfig := zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    encodeLevel,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	// 创建彩色输出写入器
	var writeSyncer zapcore.WriteSyncer
	if supportsColor() {
		writeSyncer = &ColorWriteSyncer{Writer: os.Stdout}
	} else {
		writeSyncer = zapcore.AddSync(os.Stdout)
	}

	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(encoderConfig),
		writeSyncer,
		level,
	)

	return zap.New(core, zap.AddCaller())
}

// encodeLevel 为不同级别的日志添加颜色
func encodeLevel(level zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	switch level {
	case zapcore.DebugLevel:
		enc.AppendString("[DEBUG]")
	case zapcore.InfoLevel:
		enc.AppendString("[INFO]")
	case zapcore.WarnLevel:
		enc.AppendString("[WARN]")
	case zapcore.ErrorLevel:
		enc.AppendString("[ERROR]")
	case zapcore.DPanicLevel:
		enc.AppendString("[DPANIC]")
	case zapcore.PanicLevel:
		enc.AppendString("[PANIC]")
	case zapcore.FatalLevel:
		enc.AppendString("[FATAL]")
	default:
		enc.AppendString("[" + level.CapitalString() + "]")
	}
}

// ColorWriteSyncer 彩色写入同步器
type ColorWriteSyncer struct {
	Writer *os.File
}

// Write 写入数据，添加颜色
func (w *ColorWriteSyncer) Write(p []byte) (n int, err error) {
	// 如果是日志输出并且支持颜色，则为整行添加颜色
	if supportsColor() && len(p) > 0 {
		line := string(p)
		coloredLine := colorizeLine(line)
		return w.Writer.Write([]byte(coloredLine))
	}

	return w.Writer.Write(p)
}

// Sync 同步写入
func (w *ColorWriteSyncer) Sync() error {
	// os.File 不需要特殊同步处理
	return nil
}

// colorizeLine 为整行日志添加颜色
func colorizeLine(line string) string {
	var color string

	if strings.Contains(line, "[DEBUG]") {
		color = "\033[36m" // Cyan
	} else if strings.Contains(line, "[INFO]") {
		color = "\033[32m" // Green
	} else if strings.Contains(line, "[WARN]") {
		color = "\033[33m" // Yellow
	} else if strings.Contains(line, "[ERROR]") || strings.Contains(line, "[FATAL]") || strings.Contains(line, "[PANIC]") || strings.Contains(line, "[DPANIC]") {
		color = "\033[31m" // Red
	} else {
		return line
	}

	return fmt.Sprintf("%s%s\033[0m", color, line)
}

// supportsColor 检测终端是否支持颜色
func supportsColor() bool {
	// 检查 NO_COLOR 环境变量
	if os.Getenv("NO_COLOR") != "" {
		return false
	}

	// 检查 TERM 环境变量
	term := os.Getenv("TERM")
	if strings.Contains(term, "color") || strings.Contains(term, "256") {
		return true
	}

	// 常见的支持颜色的终端
	colorTerms := []string{"xterm", "screen", "tmux", "vt100"}
	for _, t := range colorTerms {
		if strings.Contains(term, t) {
			return true
		}
	}

	// 检查是否输出到终端
	if fileInfo, _ := os.Stdout.Stat(); (fileInfo.Mode() & os.ModeCharDevice) != 0 {
		return true
	}

	return false
}
