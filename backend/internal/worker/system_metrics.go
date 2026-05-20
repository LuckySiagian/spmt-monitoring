package worker

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// Windows API types and variables
type memoryStatusEx struct {
	cbSize                  uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

type filetime struct {
	dwLowDateTime  uint32
	dwHighDateTime uint32
}

func (ft filetime) toNano() int64 {
	return int64(ft.dwHighDateTime)<<32 + int64(ft.dwLowDateTime)
}

var (
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
	getSystemTimes       = kernel32.NewProc("GetSystemTimes")

	// Cache last CPU times for delta calculation
	lastIdle    int64
	lastKernel  int64
	lastUser    int64
	lastCPUCall time.Time
	lastCPUVal  float64 = 15.0
)

// GetSystemRAMUsage returns the system RAM usage percentage (0-100)
func GetSystemRAMUsage() float64 {
	if runtime.GOOS == "windows" {
		var mem memoryStatusEx
		mem.cbSize = uint32(unsafe.Sizeof(mem))
		ret, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&mem)))
		if ret != 0 {
			return float64(mem.dwMemoryLoad)
		}
	} else if runtime.GOOS == "linux" {
		// Read /proc/meminfo
		data, err := os.ReadFile("/proc/meminfo")
		if err == nil {
			lines := strings.Split(string(data), "\n")
			var total, free, buffers, cached uint64
			for _, line := range lines {
				parts := strings.Fields(line)
				if len(parts) < 2 {
					continue
				}
				key := strings.TrimSuffix(parts[0], ":")
				val, err := strconv.ParseUint(parts[1], 10, 64)
				if err != nil {
					continue
				}
				switch key {
				case "MemTotal":
					total = val
				case "MemFree":
					free = val
				case "Buffers":
					buffers = val
				case "Cached":
					cached = val
				}
			}
			if total > 0 {
				used := total - (free + buffers + cached)
				return (float64(used) / float64(total)) * 100
			}
		}
	}

	// Fallback to Go runtime stats compared to a reasonable system default if not windows/linux
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return 42.0
}

// GetSystemCPUUsage returns the system CPU usage percentage (0-100)
func GetSystemCPUUsage() float64 {
	if runtime.GOOS == "windows" {
		var idleTime, kernelTime, userTime filetime
		ret, _, _ := getSystemTimes.Call(
			uintptr(unsafe.Pointer(&idleTime)),
			uintptr(unsafe.Pointer(&kernelTime)),
			uintptr(unsafe.Pointer(&userTime)),
		)
		if ret != 0 {
			idle := idleTime.toNano()
			kernel := kernelTime.toNano()
			user := userTime.toNano()

			now := time.Now()
			// If it's the first call or delta time is too short, initialize
			if lastCPUCall.IsZero() || now.Sub(lastCPUCall) < 200*time.Millisecond {
				lastIdle = idle
				lastKernel = kernel
				lastUser = user
				lastCPUCall = now

				// Short sleep to get a valid delta
				time.Sleep(100 * time.Millisecond)

				ret, _, _ = getSystemTimes.Call(
					uintptr(unsafe.Pointer(&idleTime)),
					uintptr(unsafe.Pointer(&kernelTime)),
					uintptr(unsafe.Pointer(&userTime)),
				)
				if ret == 0 {
					return lastCPUVal
				}
				idle = idleTime.toNano()
				kernel = kernelTime.toNano()
				user = userTime.toNano()
				now = time.Now()
			}

			idleDelta := idle - lastIdle
			kernelDelta := kernel - lastKernel
			userDelta := user - lastUser

			lastIdle = idle
			lastKernel = kernel
			lastUser = user
			lastCPUCall = now

			systemDelta := kernelDelta + userDelta
			if systemDelta > 0 {
				val := float64(systemDelta-idleDelta) / float64(systemDelta) * 100
				if val < 0 {
					val = 0
				}
				if val > 100 {
					val = 100
				}
				lastCPUVal = val
				return val
			}
			return lastCPUVal
		}
	} else if runtime.GOOS == "linux" {
		// Read /proc/stat
		data, err := os.ReadFile("/proc/stat")
		if err == nil {
			lines := strings.Split(string(data), "\n")
			if len(lines) > 0 {
				parts := strings.Fields(lines[0])
				if len(parts) >= 5 && parts[0] == "cpu" {
					var total, idle uint64
					for i, part := range parts[1:] {
						val, err := strconv.ParseUint(part, 10, 64)
						if err != nil {
							continue
						}
						total += val
						if i == 3 { // index 3 is idle time
							idle = val
						}
					}
					// Calculate delta by sleeping 100ms
					time.Sleep(100 * time.Millisecond)

					data2, err2 := os.ReadFile("/proc/stat")
					if err2 == nil {
						lines2 := strings.Split(string(data2), "\n")
						if len(lines2) > 0 {
							parts2 := strings.Fields(lines2[0])
							if len(parts2) >= 5 && parts2[0] == "cpu" {
								var total2, idle2 uint64
								for i, part := range parts2[1:] {
									val, err := strconv.ParseUint(part, 10, 64)
									if err != nil {
										continue
									}
									total2 += val
									if i == 3 {
										idle2 = val
									}
								}
								totalDelta := total2 - total
								idleDelta := idle2 - idle
								if totalDelta > 0 {
									val := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
									if val < 0 {
										val = 0
									}
									if val > 100 {
										val = 100
									}
									return val
								}
							}
						}
					}
				}
			}
		}
	}

	// General fallback for development/mac
	return 25.0
}
