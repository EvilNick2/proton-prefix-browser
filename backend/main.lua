local logger = require("logger")
local millennium = require("millennium")
local fs = require("fs")

local function steam_root()
    local ok, root = pcall(function() return millennium.steam_path() end)
    if ok and root and root ~= "" then
        return root
    end
    return (os.getenv("HOME") or "") .. "/.local/share/Steam"
end

local function read_file(path)
    local handle = io.open(path, "r")
    if not handle then return nil end
    local data = handle:read("*a")
    handle:close()
    return data
end

local function library_paths()
    local root = steam_root()
    local paths = { root }
    local vdf = read_file(root .. "/steamapps/libraryfolders.vdf")
    if vdf then
        for p in string.gmatch(vdf, '"path"%s*"([^"]+)"') do
            paths[#paths + 1] = p
        end
    end
    return paths
end

local function resolve_prefix(appid)
    local id = tostring(appid)
    if not id:match("^%d+$") then return "" end
    for _, lib in ipairs(library_paths()) do
        local pfx = lib .. "/steamapps/compatdata/" .. id .. "/pfx"
        if fs.exists(pfx) then
            return pfx
        end
    end
    return ""
end

function has_prefix(appid)
    return resolve_prefix(appid)
end

local function on_load()
    millennium.ready()
end

local function on_unload()
end

local function on_frontend_loaded()
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded
}
